import {Tunnel,connectTunnel,decode,bindRelayHTTP} from './tunnel';
import {connectionError,errorCopy} from './connection-copy';
import type {ConnectionError} from './connection-copy';
import {t as tr} from './i18n';
import './history';
import './language-menu';

declare global { interface Window { relayPairAddress?:string } }

const view='/__relay/view';
export async function openApplication(t:Tunnel,path='/',pairAddress?:string) {
  const data=await t.http(path);
  if(data.status!==200)throw new Error(`上游返回 HTTP ${data.status}，请检查本机服务与认证`);
  if(!Object.entries(data.headers).some(([key,value])=>key.toLowerCase()==='content-type'&&value.toLowerCase().includes('text/html')))throw new Error('独立页面入口需要返回 HTML；中继本身仍支持其他 HTTP 资源');
  const doc=new DOMParser().parseFromString(new TextDecoder().decode(decode(data.body)),'text/html');
  if(pairAddress)window.relayHistory.save(pairAddress,doc.title);
  // 仅改写经中继返回的副本，不修改外部项目的源码或本机文件。
  doc.querySelectorAll('base').forEach(el=>el.remove());
  const base=doc.createElement('base');base.href=view+'/';
  const runtime=doc.createElement('script');runtime.src='/__relay/runtime.js';
  const referrer=doc.createElement('meta');referrer.name='referrer';referrer.content='no-referrer';
  doc.head.prepend(base,referrer,runtime);
  t.onStats=undefined;t.onClose=undefined;t.onTransport=undefined;
  window.tailcatRelay=t;window.relayApplication=true;window.relayPairAddress=pairAddress;bindRelayHTTP();
  history.replaceState(null,'',view+path);
  document.open();document.write('<!doctype html>'+doc.documentElement.outerHTML);document.close();
}

// 独立入口直接打开；只使用本 origin 的最近地址，不依赖 parent / opener。
const input=document.querySelector<HTMLInputElement>('#standalone-pair');
const button=document.querySelector<HTMLButtonElement>('#standalone-connect');
const status=document.querySelector<HTMLElement>('#standalone-status');
const errorText=document.querySelector<HTMLElement>('#standalone-error');
const form=document.querySelector<HTMLFormElement>('#standalone-form');
if(input&&button&&status&&errorText&&form) {
  let currentError:ConnectionError|undefined;
  const renderError=()=>{errorText.textContent=currentError?currentError.message+' '+currentError.recovery:'';errorText.hidden=!currentError};
  const message=(element:HTMLElement,key:string)=>{element.dataset.i18n=key;element.textContent=tr(key)};
  const recent=document.querySelector<HTMLElement>('#standalone-recent')!;
  const historySelect=document.querySelector<HTMLSelectElement>('#standalone-history')!;
  const clearHistory=document.querySelector<HTMLButtonElement>('#standalone-clear')!;
  const renderHistory=()=>{
    if(window.relayApplication)return;
    recent.hidden=!window.relayHistory.entries.length;
    historySelect.replaceChildren(new Option(tr('recentAddresses'),''),...window.relayHistory.entries.map(item=>new Option((item.title||tr('device'))+' · …'+item.address.slice(-6),item.address)));
    historySelect.value=window.relayHistory.entries.some(item=>item.address===input.value)?input.value:'';
    historySelect.disabled=button.disabled;clearHistory.disabled=button.disabled;
    message(document.querySelector<HTMLElement>('#standalone-history-hint')!,window.relayHistory.persisted?'historyPrivacy':'historyUnavailable');
  };
  historySelect.onchange=()=>{input.value=historySelect.value;input.dispatchEvent(new Event('input'))};
  clearHistory.onclick=()=>{window.relayHistory.clear();input.value='';input.dispatchEvent(new Event('input'));input.focus()};
  const unsubscribe=window.relayI18n.subscribe(()=>{if(!window.relayApplication){renderError();renderHistory()}});
  const unsubscribeHistory=window.relayHistory.subscribe(renderHistory);
  window.addEventListener('pagehide',unsubscribeHistory,{once:true});
  window.addEventListener('pagehide',unsubscribe,{once:true});
  const params=new URLSearchParams(location.hash.slice(1));
  input.value=params.has('pair')?(params.get('pair')||''):(window.relayHistory.entries[0]?.address||'');
  renderHistory();
  history.replaceState(null,'',location.pathname+location.search);
  input.addEventListener('input',()=>{input.removeAttribute('aria-invalid');input.setAttribute('aria-describedby','standalone-hint');currentError=undefined;renderError();renderHistory()});
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(button.disabled)return;
    const address=input.value.trim();
    currentError=undefined;renderError();
    if(!/^tc[A-Za-z0-9_-]{20,}$/.test(address)){
      currentError=errorCopy('pairIncomplete','pairIncompleteRecovery',true);renderError();
      input.setAttribute('aria-invalid','true');input.setAttribute('aria-describedby','standalone-hint standalone-error');input.focus();return;
    }
    button.disabled=true;button.dataset.state='busy';button.setAttribute('aria-busy','true');input.disabled=true;
    renderHistory();
    message(button,'connecting');
    const t=new Tunnel();
    try {
      await connectTunnel(t,address,key=>message(status,key));
      window.relayHistory.save(address);
      message(status,'openingApp');
      const path=location.pathname.startsWith(view+'/')?location.pathname.slice(view.length)+location.search:location.pathname==='/__relay/index.html'?'/':location.pathname+location.search;
      await openApplication(t,path,address);
    }catch(error){
      t.close();button.disabled=false;button.dataset.state='idle';button.setAttribute('aria-busy','false');input.disabled=false;message(button,'connectAndOpen');message(status,'disconnected');
      renderHistory();
      currentError=connectionError(error);renderError();
    }
  });
}
