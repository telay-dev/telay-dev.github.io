import type {HTTPResult} from './http-cache';

export type HTTPFrame = {id:number;op:string;status?:number;headers?:Record<string,string>;body?:string;error?:string;encoding?:string};

// 以单个 32 KiB 数据块为信用，消费者停止读取时上游也停止读取。
export function receiveHTTP(id:number, send:(frame:HTTPFrame)=>Promise<void>,
  listen:(listener:(frame:HTTPFrame)=>void)=>void, unlisten:()=>void,
  decode:(body?:string)=>Uint8Array, timeoutMs=90000, signal?:AbortSignal):Promise<HTTPResult> {
  return new Promise((resolve,reject)=>{
    let controller:ReadableStreamDefaultController<Uint8Array>|undefined;
    let finishPull:(()=>void)|undefined;
    let finished=false;
    const cleanup=()=>{finished=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);unlisten();finishPull?.();finishPull=undefined};
    const cancel=()=>{void send({id,op:'http-cancel'}).catch(()=>{})};
    const fail=(message:string)=>{if(finished)return;cleanup();const error=new Error(message);if(controller)controller.error(error);else reject(error)};
    const abort=()=>{cancel();fail('请求已取消')};
    const timer=setTimeout(()=>{cancel();fail('连接器响应超时')},timeoutMs);
    listen(frame=>{
      if(finished)return;
      if(frame.error||frame.op==='ws-error'||frame.op==='ws-closed'){fail(frame.error||'隧道已断开');return}
      if(frame.op==='result') {
        cleanup();
        void (async()=>{
          let body=frame.body||'';
          if(frame.encoding==='gzip') {
            const expanded=await new Response(new Blob([new Uint8Array(decode(body))]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
            if(expanded.byteLength>32*1024*1024)throw new Error('解压后的响应超过安全上限');
            const bytes=new Uint8Array(expanded);let text='';
            for(let off=0;off<bytes.length;off+=32768)text+=String.fromCharCode(...bytes.subarray(off,off+32768));
            body=btoa(text);
          }
          resolve({status:frame.status||502,headers:frame.headers||{},body});
        })().catch(reject);
      } else if(frame.op==='http-head') {
        clearTimeout(timer);
        const stream=new ReadableStream<Uint8Array>({
          start(value){controller=value},
          pull(){
            if(finished)return;
            return new Promise<void>(done=>{
              finishPull=done;
              void send({id,op:'http-pull'}).catch(error=>fail(error.message));
            });
          },
          cancel(){if(!finished){cleanup();cancel()}},
        },{highWaterMark:0});
        resolve({status:frame.status||502,headers:frame.headers||{},body:'',stream});
      } else if(frame.op==='http-data') {
        const bytes=decode(frame.body);
        if(!controller||!finishPull||bytes.byteLength>32768){cancel();fail('流式响应协议无效');return}
        controller.enqueue(bytes);finishPull();finishPull=undefined;
      } else if(frame.op==='http-end') {
        cleanup();controller?.close();
      }
    });
    signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted)abort();
  });
}
