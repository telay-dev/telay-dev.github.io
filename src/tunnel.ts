import {localDirect} from './direct';
import {deviceCache, HTTPCache} from './http-cache';
import {receiveHTTP} from './http-stream';
import {serveHTTPPort} from './http-port';
import {connectionProgressKey} from './connection-copy';
type Conn = {read():Promise<Uint8Array|null>; write(data:Uint8Array):Promise<void>; close():void};
type Frame = {id:number;op:string;path?:string;method?:string;headers?:Record<string,string>;body?:string;status?:number;error?:string;type?:number;size?:number;ms?:number;encoding?:string;protocols?:string[];protocol?:string;sdp?:string;stream?:boolean;capabilities?:string[]};
declare global {
  interface Window { tailcatDial(opts:object):Promise<Conn>; Go:new()=>{importObject:WebAssembly.Imports;run(instance:WebAssembly.Instance):Promise<void>}; onTailcatReady?:()=>void; tailcatRelay?:Tunnel; relayHTTPBound?:boolean; relayApplication?:boolean }
}
let boot:Promise<void>|undefined;
export function loadTailcat(progress:(s:string)=>void) {
  if (boot) return boot;
  boot = (async()=>{
    progress('正在加载加密引擎（约 6.3 MB）');
    await new Promise<void>((resolve,reject)=>{
      const s=document.createElement('script');s.src='/tailcat/wasm_exec.js';s.onload=()=>resolve();s.onerror=()=>reject(new Error('加密引擎脚本加载失败'));document.head.append(s);
    });
    const ready=new Promise<void>(resolve=>{window.onTailcatReady=resolve});
    const go=new window.Go();
    const resp=await fetch('/tailcat/main.wasm.gz',{cache:'default'});
    if(!resp.ok||!resp.body) throw new Error('WASM 下载失败');
    // 有些静态主机会给 .gz 设置 Content-Encoding，浏览器已自动解压；按魔数识别，避免二次解压。
    let wasm=await resp.arrayBuffer();
    const first=new Uint8Array(wasm,0,Math.min(wasm.byteLength,2));
    if(first[0]===31&&first[1]===139)wasm=await new Response(new Blob([wasm]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    const {instance}=await WebAssembly.instantiate(wasm,go.importObject);
    void go.run(instance);
    await ready;
  })().catch(err=>{boot=undefined;throw err});
  return boot;
}

/** Runs the shared connection setup used by both page entry points. */
export async function connectTunnel(tunnel:Tunnel, address:string, progress:(key:string)=>void) {
  await loadTailcat(text=>progress(connectionProgressKey(text)));
  progress('connectingDevice');
  await tunnel.connect(address);
  await tunnel.tryDirect(text=>progress(connectionProgressKey(text)));
  progress('preparingApp');
  await activateBridge(tunnel);
}
export function encode(bytes:Uint8Array) {
  let text='';for(let off=0;off<bytes.length;off+=32768) text+=String.fromCharCode(...bytes.subarray(off,off+32768));return btoa(text);
}
export function decode(body?:string) {return Uint8Array.from(atob(body||''),c=>c.charCodeAt(0))}
export class Tunnel {
  private cache?:HTTPCache;
  private conn?:Conn;
  private relayConn?:Conn;
  private streaming=false;
  transport:'relay'|'direct'='relay';
  onTransport?:()=>void;
  private next=1;
  private queue=Promise.resolve();
  private pending=new Map<number,{resolve:(f:Frame)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  private listeners=new Map<number,(f:Frame)=>void>();
  onClose?:()=>void;
  onStats?:(stats:{sent:number;received:number})=>void;
  stats={sent:0,received:0};
  async connect(addr:string) {
    this.conn=await window.tailcatDial({addr,derpMapURL:'https://tailcat.dev/derpmap.json',port:8447});
    this.relayConn=this.conn;
    void this.readLoop(this.conn);
    const hello=await this.request({op:'ping'});
    this.streaming=!!hello.capabilities?.includes('http-stream-v1');
    this.cache=hello.capabilities?.includes('http-cache-v1')?await deviceCache(addr):undefined;
  }
  async tryDirect(progress:(text:string)=>void) {
    progress('正在检查配对两端的局域网直连（最多 12 秒）');
    try {
      const direct=await localDirect(async sdp=>{const result=await this.request({op:'direct-offer',sdp},11000);if(!result.sdp)throw new Error('连接器不支持直连，请更新连接器');return result.sdp});
      if(!this.conn){direct.close();throw new Error('连接已断开')}
      this.conn=direct;void this.readLoop(direct);
      try{await this.request({op:'ping'},3000)}catch(error){if(this.conn===direct)this.conn=this.relayConn;direct.close();throw error}
      this.transport='direct';this.onTransport?.();progress('局域网直连成功，业务数据不经过公共 DERP');
    }catch{this.transport='relay';this.onTransport?.();progress('未能直连，继续使用公共 DERP 中继（可检查防火墙、Wi-Fi 隔离或连接器版本）')}
  }
  send(frame:Frame,conn=this.conn) {
    if(!conn) return Promise.reject(new Error('连接已断开'));
    const bytes=new TextEncoder().encode(JSON.stringify(frame)+'\n');
    const result=this.queue.then(()=>conn.write(bytes));
    this.queue=result.catch(()=>{});
    return result.then(()=>{this.stats.sent+=bytes.length;this.onStats?.({...this.stats})});
  }
  private request(frame:Omit<Frame,'id'>,timeoutMs=90000):Promise<Frame> {
    const id=this.next++;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('连接器响应超时'))},timeoutMs);
      this.pending.set(id,{resolve,reject,timer});
      this.send({...frame,id}).catch(e=>{clearTimeout(timer);this.pending.delete(id);reject(e)});
    });
  }
  async http(path:string,method='GET',headers:Record<string,string>={},body='',cacheMode:RequestCache='default',signal?:AbortSignal) {
    const origin=(path:string,method:string,headers:Record<string,string>,body:string)=>this.originHTTP(path,method,headers,body,signal);
    return this.cache?this.cache.request(path,method,headers,body,cacheMode,origin):origin(path,method,headers,body);
  }
  private async originHTTP(path:string,method:string,headers:Record<string,string>,body:string,signal?:AbortSignal) {
    if(signal?.aborted)throw new Error('请求已取消');
    if(this.streaming){
      const id=this.next++;const conn=this.conn;
      const result=receiveHTTP(id,frame=>this.send(frame,conn),listener=>this.listeners.set(id,listener),()=>this.listeners.delete(id),decode,90000,signal);
      void this.send({id,op:'http',path,method,headers,body,stream:true},conn).catch(error=>this.listeners.get(id)?.({id,op:'http-error',error:error.message}));
      return result;
    }
    if(Object.entries(headers).some(([key,value])=>key.toLowerCase()==='accept'&&value.includes('text/event-stream')))throw new Error('SSE 需要更新本机连接器');
    const f=await this.request({op:'http',path,method,headers,body});
    if(f.error) throw new Error(f.error);
    if(f.encoding==='gzip') {
      const expanded=await new Response(new Blob([decode(f.body)]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      if(expanded.byteLength>32*1024*1024)throw new Error('解压后的响应超过安全上限');
      f.body=encode(new Uint8Array(expanded));
    }
    return {status:f.status||502,headers:f.headers||{},body:f.body||''};
  }
  async ping() {const start=performance.now();await this.request({op:'ping'});return Math.round(performance.now()-start)}
  async probe() {
    const start=performance.now();const f=await this.request({op:'probe',size:262144});if(f.error)throw new Error(f.error);
    const body=decode(f.body);if(body.length!==262144||body.some((b,i)=>b!==i%251))throw new Error('测速数据完整性校验失败');
    const seconds=(performance.now()-start)/1000;
    return {mbps:Number((body.length*8/seconds/1e6).toFixed(2)),seconds:Number(seconds.toFixed(2))};
  }
  openSocket(path:string, listener:(f:Frame)=>void,protocols:string[]=[]) {const id=this.next++;this.listeners.set(id,listener);void this.send({id,op:'ws-open',path,protocols}).catch(()=>listener({id,op:'ws-error',error:'隧道已断开'}));return id}
  socketSend(id:number,body:string,type:number) {return this.send({id,op:'ws-send',body,type})}
  socketClose(id:number) {this.listeners.delete(id);void this.send({id,op:'ws-close'}).catch(()=>{})}
  private async readLoop(conn:Conn) {
    let buffer='';const decoder=new TextDecoder();
    try {
      for(let chunk;(chunk=await conn.read())!==null;) {
        this.stats.received+=chunk.length;this.onStats?.({...this.stats});buffer+=decoder.decode(chunk,{stream:true});
        if(buffer.length>46*1024*1024)throw new Error('响应超过安全上限');
        let end;
        while((end=buffer.indexOf('\n'))!==-1){
          const f:Frame=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);
          const pending=this.pending.get(f.id);
          if(pending){clearTimeout(pending.timer);this.pending.delete(f.id);f.error?pending.reject(new Error(f.error)):pending.resolve(f)}else {this.listeners.get(f.id)?.(f);if(f.op==='ws-closed'||f.op==='ws-error')this.listeners.delete(f.id)};
        }
      }
    }catch{ /* 统一在 close 中通知所有等待者 */ }
    if(this.conn!==conn){if(this.relayConn===conn)this.relayConn=undefined;return}
    if(this.transport==='direct'&&this.relayConn&&this.relayConn!==conn){
      this.conn=this.relayConn;this.transport='relay';conn.close();
      for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('直连中断，已回退中继；请重试，写请求不会自动重放'))}this.pending.clear();
      for(const [id,l]of this.listeners)l({id,op:'ws-error',error:'直连中断'});this.listeners.clear();this.onTransport?.();return;
    }
    this.close();
  }
  close() {
    if(!this.conn)return;
    const conn=this.conn;this.conn=undefined;conn.close();this.relayConn?.close();this.relayConn=undefined;
    if(window.tailcatRelay===this)delete window.tailcatRelay;
    for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('隧道已断开'))}this.pending.clear();
    for(const [id,l]of this.listeners){l({id,op:'ws-closed'})}this.listeners.clear();this.onClose?.();
  }
}
export async function activateBridge(tunnel:Tunnel) {
  window.tailcatRelay=tunnel;
  if(!('serviceWorker'in navigator)) throw new Error('浏览器不支持 Service Worker，请使用新版 Chrome 或 Safari');
  const scriptURL=new URL('/bridge-sw.js',location.origin).href;
  const registration=await navigator.serviceWorker.register(scriptURL,{scope:'/',updateViaCache:'none'});
  const worker=registration.installing||registration.waiting||registration.active;
  if(worker&&worker.state!=='activated')await new Promise<void>((resolve,reject)=>{
    const cleanup=()=>{clearTimeout(timer);worker.removeEventListener('statechange',changed)};
    const changed=()=>{if(worker.state==='activated'){cleanup();resolve()}else if(worker.state==='redundant'){cleanup();reject(new Error('页面载体初始化失败'))}};
    const timer=setTimeout(()=>{cleanup();reject(new Error('页面载体初始化超时，请刷新重试'))},10000);
    worker.addEventListener('statechange',changed);changed();
  });
  await navigator.serviceWorker.ready;
  if(navigator.serviceWorker.controller?.scriptURL!==scriptURL) await new Promise<void>((resolve,reject)=>{
    const cleanup=()=>{clearTimeout(timer);navigator.serviceWorker.removeEventListener('controllerchange',changed)};
    const changed=()=>{if(navigator.serviceWorker.controller?.scriptURL===scriptURL){cleanup();resolve()}};
    const timer=setTimeout(()=>{cleanup();reject(new Error('页面载体初始化超时，请刷新重试'))},10000);
    navigator.serviceWorker.addEventListener('controllerchange',changed);registration.active?.postMessage({op:'claim'});changed();
  });
}
export function bindRelayHTTP() {
if(window.relayHTTPBound)return;
window.relayHTTPBound=true;
navigator.serviceWorker?.addEventListener('message',async(event)=>{
  if(event.data?.op==='relay-identify'){event.ports[0]?.postMessage({active:!!window.relayApplication});return}
  if(event.data?.op!=='relay-http'||!event.ports[0])return;
  await serveHTTPPort(event.ports[0],signal=>{if(!window.tailcatRelay)throw new Error('未连接');return window.tailcatRelay.http(event.data.path,event.data.method,event.data.headers,event.data.body,event.data.cache,signal)});
});
}
bindRelayHTTP();
