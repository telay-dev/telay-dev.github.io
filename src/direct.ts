export type DirectConn={read():Promise<Uint8Array|null>;write(data:Uint8Array):Promise<void>;close():void};
export async function localDirect(exchange:(sdp:string)=>Promise<string>):Promise<DirectConn> {
  if(!window.RTCPeerConnection)throw new Error('浏览器不支持 WebRTC');
  // 无 STUN / TURN；仅交换配对两端的 host candidates，不做网段扫描。
  const peer=new RTCPeerConnection({iceServers:[]});
  const channel=peer.createDataChannel('relay-v1',{ordered:true});channel.binaryType='arraybuffer';channel.bufferedAmountLowThreshold=65536;
  let ended=false;const chunks:Uint8Array[]=[];let queued=0;let wake:(()=>void)|undefined;
  const end=()=>{ended=true;wake?.();wake=undefined};
  channel.onmessage=e=>{const bytes=new Uint8Array(e.data);queued+=bytes.length;if(queued>2*1024*1024){peer.close();end();return}chunks.push(bytes);wake?.();wake=undefined};
  channel.onclose=end;channel.onerror=end;
  const timeout=new Promise<never>((_,reject)=>{const id=setTimeout(()=>{peer.close();end();reject(new Error('局域网直连超时'))},12000);channel.addEventListener('open',()=>clearTimeout(id),{once:true})});
  const connect=(async()=>{
    await peer.setLocalDescription(await peer.createOffer());
    await new Promise<void>(resolve=>{if(peer.iceGatheringState==='complete')resolve();else peer.addEventListener('icegatheringstatechange',()=>{if(peer.iceGatheringState==='complete')resolve()})});
    const opened=new Promise<void>((resolve,reject)=>{channel.addEventListener('open',()=>resolve(),{once:true});channel.addEventListener('error',()=>reject(new Error('WebRTC 数据通道失败')),{once:true})});
    if(!peer.localDescription)throw new Error('未生成直连协商描述');
    const sdp=await exchange(peer.localDescription.sdp);
    await peer.setRemoteDescription({type:'answer',sdp});await opened;
  })();
  try{await Promise.race([connect,timeout])}catch(error){peer.close();end();throw error}
  return {
    async read(){for(;;){const chunk=chunks.shift();if(chunk){queued-=chunk.length;return chunk}if(ended)return null;await new Promise<void>(resolve=>{wake=resolve})}},
    async write(data){
      for(let offset=0;offset<data.length;offset+=16384){
        if(channel.readyState!=='open')throw new Error('直连已断开');
        if(channel.bufferedAmount>262144)await new Promise<void>((resolve,reject)=>{
          const cleanup=()=>{clearTimeout(timer);channel.removeEventListener('bufferedamountlow',ready);channel.removeEventListener('close',closed)};
          const ready=()=>{cleanup();resolve()};const closed=()=>{cleanup();reject(new Error('直连已断开'))};
          const timer=setTimeout(closed,10000);channel.addEventListener('bufferedamountlow',ready,{once:true});channel.addEventListener('close',closed,{once:true});
        });
        channel.send(data.slice(offset,offset+16384));
      }
    },
    close(){peer.close();end()},
  };
}
