(async()=>{
  const result={};const timeout=(promise,ms=12000)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error('验收超时')),ms))]);
  try {
    const before=await (await fetch('/state')).json();
    const a=await (await fetch('/asset')).text();const b=await (await fetch('/asset')).text();
    const after=await (await fetch('/state')).json();
    result.httpCache=a==='cached value'&&b===a&&(after.asset||0)-(before.asset||0)<=1;
    result.ws=await timeout(new Promise((resolve,reject)=>{
      const ws=new WebSocket(location.origin.replace(/^http/,'ws')+'/ws','test');ws.binaryType='arraybuffer';let text=false;
      ws.onerror=()=>{ws.close();reject(new Error('WS 失败'))};
      ws.onopen=()=>ws.send('中文文本');
      ws.onmessage=event=>{if(typeof event.data==='string'){text=event.data==='中文文本';ws.send(new Uint8Array([0,255,128,1]))}else{const bytes=new Uint8Array(event.data);const ok=text&&ws.protocol==='test'&&bytes.join(',')==='0,255,128,1';ws.close();resolve(ok)}};
    }));
    const started=performance.now();
    result.sse=await timeout(new Promise((resolve,reject)=>{
      const source=new EventSource('/events');const values=[];let firstEventMs;
      source.onerror=()=>{source.close();reject(new Error('SSE 失败'))};
      source.onmessage=event=>{values.push(event.data);firstEventMs??=Math.round(performance.now()-started);if(values.length===3){source.close();resolve({firstEventMs,ordered:values.join(',')==='消息-1,消息-2,消息-3'})}};
    }));
    result.reconnect=await timeout(new Promise((resolve,reject)=>{
      const source=new EventSource('/events?reconnect=1');const events=[];
      const timer=setTimeout(()=>{source.close();reject(new Error('SSE 重连超时'))},8000);
      source.onmessage=event=>{events.push({id:event.lastEventId,data:event.data});if(event.data==='resumed'){clearTimeout(timer);source.close();resolve(events)}};
    }));
    const response=await fetch('/post-stream',{method:'POST',body:'posted-token'});
    const reader=response.body.getReader();let body='';
    while(!body.includes('posted-token')){const next=await timeout(reader.read());if(next.done)break;body+=new TextDecoder().decode(next.value)}
    await reader.cancel();result.postStream=body.includes('posted-token');
    const abort=new AbortController();const active=await fetch('/events',{signal:abort.signal});const activeReader=active.body.getReader();await activeReader.read();abort.abort();
    try{await activeReader.read()}catch{result.abort=true}
    await new Promise(resolve=>setTimeout(resolve,200));
    result.state=await (await fetch('/state')).json();
    result.transport=window.tailcatRelay.transport;
    result.cacheEntries=(await caches.keys()).filter(name=>name.startsWith('relay-http-v1-')).length;
    result.ok=result.httpCache&&result.ws&&result.sse.ordered&&result.reconnect.length===2&&result.postStream&&result.abort&&result.state.resumed-(before.resumed||0)===1;
  }catch(error){result.ok=false;result.error=error.message}
  return result;
})()
