// 流式协议、页面端口与 Service Worker 的隔离回归。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const globals={ReadableStream,TextDecoder,TextEncoder,Uint8Array,ArrayBuffer,Blob,Response,Request,URL,
  MessageChannel,AbortController,setTimeout,clearTimeout,btoa,atob};
const load=file=>{
  const exports={};
  vm.runInNewContext(ts.transpileModule(read(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,...globals});
  return exports;
};
const {receiveHTTP}=load('src/http-stream.ts');
const {serveHTTPPort}=load('src/http-port.ts');
const self={};vm.runInNewContext(read('public/__relay/http-response.js'),{self,...globals});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function streamHarness(signal,timeout=100) {
  let listener;const sent=[];
  const promise=receiveHTTP(1,async frame=>{sent.push(frame)},value=>{listener=value},()=>{listener=undefined},body=>Uint8Array.from(Buffer.from(body||'','base64')),timeout,signal);
  return {promise,sent,emit:frame=>listener?.({id:1,...frame}),active:()=>!!listener};
}
{
  const h=streamHarness(undefined,15);
  h.emit({op:'http-head',status:200,headers:{'Content-Type':'text/event-stream'}});
  const result=await h.promise;assert.equal(result.status,200);
  await pause(30);assert.ok(h.active(),'首部后不受普通 HTTP 总时限影响');assert.equal(h.sent.length,0,'不预读');
  const reader=result.stream.getReader();const first=reader.read();await pause(1);assert.equal(h.sent[0].op,'http-pull');
  h.emit({op:'http-data',body:Buffer.from('data: 中文\n\n').toString('base64')});
  assert.equal(new TextDecoder().decode((await first).value),'data: 中文\n\n');
  const end=reader.read();await pause(1);h.emit({op:'http-end'});assert.equal((await end).done,true);assert.equal(h.active(),false);
}
{
  const h=streamHarness();h.emit({op:'http-head',status:200});const r=(await h.promise).stream.getReader();
  const next=r.read();await pause(1);h.emit({op:'http-error',error:'上游失败'});
  await assert.rejects(next,/上游失败/);assert.equal(h.active(),false);
}
{
  const h=streamHarness();h.emit({op:'http-head',status:200});const result=await h.promise;
  await result.stream.cancel();assert.equal(h.sent.at(-1).op,'http-cancel');assert.equal(h.active(),false);
}
{
  const abort=new AbortController();const h=streamHarness(abort.signal);abort.abort();
  await assert.rejects(h.promise,/取消/);assert.equal(h.sent.at(-1).op,'http-cancel');assert.equal(h.active(),false);
}
{
  const h=streamHarness(undefined,5);await assert.rejects(h.promise,/超时/);assert.equal(h.sent.at(-1).op,'http-cancel');
}
{
  const h=streamHarness();h.emit({op:'result',status:304,headers:{ETag:'"v1"'}});
  assert.equal((await h.promise).status,304,'普通 HTTP 保留304');assert.equal(h.active(),false);
}
function portHarness(request,signal=new AbortController().signal) {
  let life;const event={request:{signal},waitUntil(promise){life=promise}};
  const target={postMessage(_message,ports){void serveHTTPPort(ports[0],request)}};
  return {response:self.relayHTTPResponse(event,target,{op:'relay-http',method:'GET'}),life:()=>life};
}
{
  const h=streamHarness();
  const port=portHarness(()=>h.promise);h.emit({op:'http-head',status:200,headers:{'Content-Type':'text/event-stream','Cache-Control':'no-store'}});
  const response=await port.response;assert.equal(response.headers.get('content-type'),'text/event-stream');
  await pause(10);assert.equal(h.sent.length,0,'两个端口不预读');
  const reader=response.body.getReader();const first=reader.read();await pause(10);
  assert.equal(h.sent.length,1);h.emit({op:'http-data',body:Buffer.from('id: 7\ndata: 第一条\n\n').toString('base64')});
  assert.equal(new TextDecoder().decode((await first).value),'id: 7\ndata: 第一条\n\n');
  await pause(10);assert.equal(h.sent.length,1,'慢消费者不继续发信用');
  await reader.cancel();await port.life();await pause(10);assert.equal(h.sent.at(-1).op,'http-cancel');assert.equal(h.active(),false);
}
{
  const abort=new AbortController();let aborted=false;
  const pending=portHarness(value=>new Promise((_resolve,reject)=>value.addEventListener('abort',()=>{aborted=true;reject(new Error('取消'))})),abort.signal);
  abort.abort();await assert.rejects(pending.response,/取消/);await pause(10);assert.equal(aborted,true);
}
{
  const port=portHarness(async()=>({status:200,headers:{'Content-Type':'text/plain'},body:btoa('cached body')}));
  assert.equal(await (await port.response).text(),'cached body');await port.life();
}
{
  const h=streamHarness();const port=portHarness(()=>h.promise);h.emit({op:'http-head',status:200});
  const response=await port.response;h.emit({op:'http-error',error:'空闲流断线'});
  await port.life();await assert.rejects(response.body.getReader().read(),/空闲流断线/);
}
console.log('流式回归通过：即时首部、持续流、单块背压、端口链路、取消、超时、断线错误及普通响应。');
