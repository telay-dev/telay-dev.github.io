// 配对地址是凭证：仅存此 origin 的本地存储，不上传，不自动连接。
(() => {
  const key = 'relay.recent.v1';
  const valid = address => typeof address === 'string' && /^tc[A-Za-z0-9_-]{20,2046}$/.test(address);
  const normalize = value => {
    const seen = new Set();
    return (Array.isArray(value) ? value.slice(0, 64) : []).filter(item => {
      if (!item || !valid(item.address) || seen.has(item.address)) return false;
      seen.add(item.address); return true;
    }).slice(0, 5).map(item => ({address: item.address,
      title: typeof item.title === 'string' ? item.title.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 60) : ''}));
  };
  const read = () => {try {const raw=localStorage.getItem(key)||'[]';return raw.length<=32768?normalize(JSON.parse(raw)):[]} catch {return []}};
  let entries = read();
  let persisted = true;
  const listeners = new Set();
  const notify = () => {for (const listener of listeners) listener()};
  const write = next => {
    entries = normalize(next);
    try {if (entries.length) localStorage.setItem(key, JSON.stringify(entries)); else localStorage.removeItem(key); persisted = true}
    catch {persisted = false}
    notify(); return persisted;
  };
  const save = (address, title = '') => {
    if (!valid(address)) return false;
    const old = entries.find(item => item.address === address);
    return write([{address, title: title || old?.title || ''}, ...entries.filter(item => item.address !== address)]);
  };
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) {entries = read(); persisted = true; notify()}
  });
  window.relayHistory = {get entries() {return entries}, get persisted() {return persisted}, valid, save,
    clear() {const result = write([]);window.dispatchEvent(new Event('relay-history-cleared'));return result},
    subscribe(listener) {listeners.add(listener); return () => listeners.delete(listener)}};
})();
