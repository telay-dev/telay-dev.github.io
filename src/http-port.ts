import type {HTTPResult} from './http-cache';

// 页面负责加密连接；Service Worker 通过 MessagePort 按需拉取。
export async function serveHTTPPort(port:MessagePort, request:(signal:AbortSignal)=>Promise<HTTPResult>) {
  const abort=new AbortController();
  let cancelled=false;
  let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
  let pulling=false;
  let finished=false;
  const close=()=>{finished=true;port.onmessage=null;port.close()};
  port.onmessage=event=>{
    if(event.data?.op==='http-cancel'){
      cancelled=true;abort.abort();void reader?.cancel().catch(()=>{});close();
    } else if(event.data?.op==='http-pull'&&reader&&!pulling&&!cancelled){
      pulling=true;
      void reader.read().then(({value,done})=>{
        pulling=false;if(cancelled||finished)return;
        if(done){port.postMessage({op:'http-end'});close()}
        else port.postMessage({op:'http-data',body:value.buffer},[value.buffer]);
      }).catch(error=>{if(!cancelled&&!finished){port.postMessage({op:'http-error',error:error.message});close()}});
    }
  };
  try {
    const result=await request(abort.signal);
    if(cancelled){await result.stream?.cancel();return}
    if(result.stream){
      reader=result.stream.getReader();port.postMessage({status:result.status,headers:result.headers,stream:true});
      // 即使消费者暂停读取，断线也要及时通知 SW，释放请求生命周期。
      void reader.closed.catch(error=>{if(!cancelled&&!finished){port.postMessage({op:'http-error',error:error.message});close()}});
    }
    else {port.postMessage(result);close()}
  }catch(error){if(!cancelled){port.postMessage({error:error instanceof Error?error.message:'连接失败'});close()}}
}
