// 在 SW 内把页面 MessagePort 转为标准 Response / ReadableStream。
self.relayHTTPResponse=function(event,target,message){
  const channel=new MessageChannel();
  let controller,finishPull,streaming=false,finished=false;
  let complete;
  const lifetime=new Promise(resolve=>{complete=resolve});
  event.waitUntil(lifetime);
  let resolveHead,rejectHead;
  const response=new Promise((resolve,reject)=>{resolveHead=resolve;rejectHead=reject});
  const cleanup=()=>{finished=true;clearTimeout(timer);event.request.signal.removeEventListener('abort',abort);channel.port1.close();finishPull?.();finishPull=undefined;complete()};
  const cancel=()=>channel.port1.postMessage({op:'http-cancel'});
  const fail=message=>{if(finished)return;const error=new Error(message);cleanup();if(streaming)controller.error(error);else rejectHead(error)};
  const abort=()=>{if(!finished){cancel();fail('请求已取消')}};
  const timer=setTimeout(()=>{cancel();fail('隧道请求超时')},95000);
  channel.port1.onmessage=event=>{
    const data=event.data;
    if(finished)return;
    if(data.error){fail(data.error);return}
    if(data.op==='http-data'){
      if(!streaming||!finishPull){cancel();fail('流式响应协议无效');return}
      controller.enqueue(new Uint8Array(data.body));finishPull();finishPull=undefined;return;
    }
    if(data.op==='http-end'){cleanup();controller?.close();return}
    clearTimeout(timer);
    if(data.stream){
      streaming=true;
      const stream=new ReadableStream({
        start(value){controller=value},
        pull(){if(finished)return;return new Promise(resolve=>{finishPull=resolve;channel.port1.postMessage({op:'http-pull'})})},
        cancel(){if(!finished){cancel();cleanup()}},
      },{highWaterMark:0});
      resolveHead(new Response(stream,{status:data.status,headers:data.headers}));
    }else{
      const bytes=Uint8Array.from(atob(data.body||''),c=>c.charCodeAt(0));
      cleanup();
      resolveHead(new Response([101,204,205,304].includes(data.status)||message.method==='HEAD'?null:bytes,{status:data.status,headers:data.headers}));
    }
  };
  event.request.signal.addEventListener('abort',abort,{once:true});
  target.postMessage(message,[channel.port2]);
  if(event.request.signal.aborted)abort();
  return response;
};
