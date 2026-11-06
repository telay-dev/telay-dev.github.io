// 不请求网络或调用模型：验证语言选择、完整词典、入口与运行时文案。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const read = file => readFileSync(path.join(root, file), 'utf8');
const source = read('public/__relay/i18n.js');
const dictionaries = vm.runInNewContext('(' + source.split('const messages = ')[1].split('\n\n  function selectLocale')[0].trim().replace(/;$/, '') + ')');
const keys = Object.keys(dictionaries.en).sort();
assert.deepEqual(Object.keys(dictionaries['zh-CN']).sort(), keys);
assert.deepEqual(Object.keys(dictionaries.ja).sort(), keys);
for (const key of keys) {
  for (const locale of ['en', 'zh-CN', 'ja']) assert.ok(dictionaries[locale][key].trim(), `${locale}:${key}`);
  assert.ok(!/\p{Script=Han}/u.test(dictionaries.en[key]), `英文词典不应残留中文：${key}`);
  const slots = value => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
  assert.deepEqual(slots(dictionaries.en[key]), slots(dictionaries['zh-CN'][key]), `插值不一致：${key}`);
  assert.deepEqual(slots(dictionaries.en[key]), slots(dictionaries.ja[key]), `日文插值不一致：${key}`);
}

function element() {
  return {textContent: '', hidden: false, disabled: false, attributes: {}, dataset: {}, style: {},
    setAttribute(name, value) {this.attributes[name] = value},
    getAttribute(name) {return this.attributes[name]}};
}
function createContext(languages, language = languages?.[0], storage = new Map(), storageDenied = false) {
  const heading = element(); heading.dataset.i18n = 'heading';
  const input = element(); input.attributes['data-i18n-placeholder'] = 'pairPlaceholder';
  const link = element(); link.attributes['data-i18n-aria-label'] = 'home';
  const languageSelect = element(); languageSelect.attributes['data-i18n-aria-label'] = 'language';
  const handlers = {};
  const document = {documentElement: {lang: 'fr'}, title: 'Upstream title',
    querySelectorAll(selector) {
      if (selector === '[data-i18n]') return [heading];
      if (selector === '[data-i18n-placeholder]') return [input];
      if (selector === '[data-i18n-aria-label]') return [link, languageSelect];
      if (selector === '[data-relay-language]') return [languageSelect];
      return [];
    }};
  const localStorage = {
    getItem(key) {if (storageDenied) throw Error('storage denied'); return storage.get(key) ?? null},
    setItem(key, value) {if (storageDenied) throw Error('storage denied'); storage.set(key, value)},
    removeItem(key) {if (storageDenied) throw Error('storage denied'); storage.delete(key)},
  };
  const context = vm.createContext({window: {addEventListener(type, callback) {(handlers[type] ||= []).push(callback)}},
    navigator: {languages, language, serviceWorker: {}}, document, localStorage,
    EventTarget, Event, MessageEvent, DOMException, Error, setTimeout, clearTimeout, TextEncoder, TextDecoder});
  vm.runInContext(source, context);
  return {context, i18n: context.window.relayI18n, document, heading, input, link, languageSelect, handlers, storage};
}

for (const [languages, expected] of [
  [['zh-CN'], 'zh-CN'], [['zh-TW', 'en'], 'zh-CN'], [['ZH-hant-HK'], 'zh-CN'],
  [['en-GB', 'zh-CN'], 'en'], [['fr-FR', 'zh-CN', 'en'], 'zh-CN'],
  [['de-DE', 'en-US'], 'en'], [['ja-JP'], 'ja'], [['JA'], 'ja'], [['fr', 'ja', 'en'], 'ja'], [[], 'en'],
]) assert.equal(createContext(languages).i18n.locale, expected);
assert.equal(createContext(undefined, 'zh-SG').i18n.locale, 'zh-CN');

{
  const {context, i18n, handlers, storage, languageSelect} = createContext(['zh-CN']);
  let notifications = 0;
  const unsubscribe = i18n.subscribe(() => notifications++);
  i18n.setPreference('en');
  assert.equal(i18n.locale, 'en');
  assert.equal(storage.get('relay.language'), 'en');
  assert.equal(createContext(['zh-CN'], 'zh-CN', storage).i18n.locale, 'en', '刷新记住主动选择');
  i18n.applyDocument();
  assert.equal(languageSelect.value, 'en');
  languageSelect.value = 'zh-CN'; languageSelect.onchange();
  assert.equal(i18n.locale, 'zh-CN');
  i18n.setPreference('auto');
  assert.equal(storage.has('relay.language'), false);
  context.navigator.languages = ['en-US']; handlers.languagechange[0]();
  assert.equal(i18n.locale, 'en', '自动模式跟随浏览器语言变更');
  handlers.storage[0]({key: 'relay.language', newValue: 'zh-CN'});
  assert.equal(i18n.locale, 'zh-CN', '跨标签页同步选择');
  i18n.setPreference('ja');
  assert.equal(createContext(['en'], 'en', storage).i18n.locale, 'ja', '日文选择可记忆');
  handlers.storage[0]({key: 'relay.language', newValue: 'zh-CN'});
  assert.throws(() => i18n.setPreference('invalid'), /Invalid Relay language/);
  assert.equal(i18n.preference, 'zh-CN');
  unsubscribe(); const before = notifications; i18n.setPreference('en');
  assert.equal(notifications, before);
  const denied = createContext(['zh-CN'], 'zh-CN', new Map(), true).i18n;
  denied.setPreference('en'); assert.equal(denied.locale, 'en', '禁用存储时当前页仍能切换');
  assert.equal(createContext(['zh-CN'], 'zh-CN', new Map([['relay.language', 'invalid']])).i18n.locale, 'zh-CN');
}

for (const locale of ['en', 'zh-CN', 'ja']) {
  const {context, i18n, document, heading, input, link} = createContext([locale]);
  i18n.applyDocument();
  assert.equal(document.documentElement.lang, locale);
  assert.equal(document.title, dictionaries[locale].pageTitle);
  assert.equal(heading.textContent, dictionaries[locale].heading);
  assert.equal(input.attributes.placeholder, dictionaries[locale].pairPlaceholder);
  assert.equal(link.attributes['aria-label'], dictionaries[locale].home);
  assert.equal(i18n.t('upstreamHTTP', {status: 401}), dictionaries[locale].upstreamHTTP.replace('{status}', '401'));
  assert.throws(() => i18n.t('unknown-test-key'), /Missing Relay translation/);

  const exports = {};
  context.exports = exports;
  context.require = () => ({t: i18n.t});
  vm.runInContext(ts.transpileModule(read('src/connection-copy.ts'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
  }).outputText, context);
  for (const [raw, message, recovery] of [
    ['invalid addr', 'pairInvalid', 'pairInvalidRecovery'], ['WASM download failed', 'engineFailed', 'engineRecovery'],
    ['浏览器不支持 Service Worker', 'browserUnsupported', 'browserRecovery'],
    ['页面载体初始化超时', 'appNotReady', 'appRecovery'], ['入口没有 HTML', 'noHTML', 'noHTMLRecovery'],
    ['仅测速', 'probeOnly', 'probeRecovery'], ['timeout', 'timeout', 'timeoutRecovery'],
    ['隧道已断开', 'connectionClosed', 'closedRecovery'], ['测速完整性失败', 'integrityFailed', 'integrityRecovery'],
    ['unknown', 'operationFailed', 'operationRecovery'],
  ]) {
    const result = exports.connectionError(new Error(raw));
    assert.equal(result.message, i18n.t(message));
    assert.equal(result.recovery, i18n.t(recovery));
  }
  assert.equal(exports.connectionError(new Error('上游返回 HTTP 403，secret-url')).message, i18n.t('upstreamHTTP', {status: 403}));
  for (const [raw, key] of [['正在加载', 'loadingEngine'], ['正在检查', 'tryingDirect'], ['未能直连', 'usingRelay'], ['直连成功', 'directReady']]) {
    assert.equal(exports.connectionProgress(raw), i18n.t(key));
  }
  const retained = exports.connectionError(new Error('timeout'));
  i18n.setPreference(locale === 'en' ? 'zh-CN' : 'en');
  assert.equal(retained.message, i18n.t('timeout'), '已显示的错误也立即翻译');
}

const files = ['src/App.tsx', 'src/QuickInstall.tsx', 'src/RelayHelp.tsx', 'src/LanguageSelect.tsx', 'src/connection-copy.ts', 'src/standalone.ts', 'public/__relay/runtime.js'];
for (const file of files) {
  for (const match of read(file).matchAll(/\b(?:t|tr)\('([^']+)'/g)) assert.ok(keys.includes(match[1]), `${file}:${match[1]}`);
}
for (const match of read('__relay/index.html').matchAll(/data-i18n(?:-placeholder|-aria-label)?="([^"]+)"/g)) {
  assert.ok(keys.includes(match[1]), `独立入口：${match[1]}`);
}

for (const locale of ['en', 'zh-CN', 'ja']) {
  const {context, i18n, document} = createContext([locale]);
  const controls = Object.fromEntries(['summary', 'details', '#full', '#new-tab', '#disconnect', '#reconnect', '#route', '#language-menu', '.language-options'].map(key => [key, element()]));
  controls['#reconnect'].hidden = true;
  const shadow = {querySelector: selector => controls[selector]};
  const host = {style: {}, attachShadow: () => shadow};
  document.createElement = () => host;
  document.readyState = 'complete';
  document.addEventListener = () => {};
  document.body = {append() {}};
  const relay = {transport: 'direct', closeCount: 0, close() {this.closeCount++; this.onClose?.()}};
  context.window.tailcatRelay = relay;
  context.window.WebSocket = class {};
  context.window.addEventListener = () => {};
  context.window.relayPairAddress = 'temporary-test-address';
  let mounted = false;
  context.window.telayLanguageMenu = {mount(target) {assert.equal(target, controls['#language-menu']);mounted = true;return () => {}}};
  vm.runInContext(read('public/__relay/runtime.js'), context);
  assert.ok(mounted, '运行时复用共享语言菜单');
  assert.equal(controls['.language-options'].style.bottom, '100%');
  assert.equal(host.lang, locale);
  assert.equal(document.documentElement.lang, 'fr', '不改外部应用的语言');
  assert.equal(document.title, 'Upstream title', '不改外部应用的标题');
  assert.equal(controls.summary.attributes['aria-label'], i18n.t('connectionOptions'));
  assert.equal(controls['#route'].textContent, i18n.t('connectedDirect'));
  for (const [id, key] of [['#full', 'fullscreen'], ['#new-tab', 'newTab'], ['#disconnect', 'disconnect'], ['#reconnect', 'reconnect']]) {
    assert.equal(controls[id].textContent, i18n.t(key));
  }
  assert.equal(controls['#reconnect'].hidden, true);
  relay.transport = 'relay'; relay.onTransport();
  assert.equal(controls['#route'].textContent, i18n.t('connectedRelay'));
  i18n.setPreference(locale === 'en' ? 'ja' : 'en');
  assert.equal(host.lang, i18n.locale);
  assert.equal(controls['#route'].textContent, i18n.t('connectedRelay'));
  assert.equal(controls['#disconnect'].textContent, i18n.t('disconnect'));
  assert.equal(document.documentElement.lang, 'fr');
  assert.equal(relay.closeCount, 0, '切换语言不能断开连接');
  controls['#disconnect'].onclick();
  assert.equal(controls['#route'].textContent, i18n.t('closedPairAgain'));
  assert.equal(controls['#reconnect'].hidden, false);
  assert.equal(controls['#new-tab'].disabled, true);
}
console.log(`国际化回归通过：${keys.length} 个三语词条、自动/手动/存储禁用/跨页同步、入口与错误、菜单即时切换且不关闭连接。`);
