// No network or model calls: verify locale selection, dictionary coverage, entry pages, and runtime copy.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const source = read("public/__relay/i18n.js");
const dictionaries = vm.runInNewContext(
  "(" +
    source
      .split("const messages = ")[1]
      .split("\n\n  function selectLocale")[0]
      .trim()
      .replace(/;$/, "") +
    ")",
);
const keys = Object.keys(dictionaries.en).sort();
assert.deepEqual(Object.keys(dictionaries["zh-CN"]).sort(), keys);
assert.deepEqual(Object.keys(dictionaries.ja).sort(), keys);
for (const key of keys) {
  for (const locale of ["en", "zh-CN", "ja"])
    assert.ok(dictionaries[locale][key].trim(), `${locale}:${key}`);
  assert.ok(
    !/\p{Script=Han}/u.test(dictionaries.en[key]),
    `English dictionary contains Han characters: ${key}`,
  );
  const slots = (value) =>
    [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
  assert.deepEqual(
    slots(dictionaries.en[key]),
    slots(dictionaries["zh-CN"][key]),
    `placeholder mismatch: ${key}`,
  );
  assert.deepEqual(
    slots(dictionaries.en[key]),
    slots(dictionaries.ja[key]),
    `Japanese placeholder mismatch: ${key}`,
  );
}

function element() {
  return {
    textContent: "",
    hidden: false,
    disabled: false,
    attributes: {},
    dataset: {},
    style: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    getAttribute(name) {
      return this.attributes[name];
    },
  };
}
function createContext(
  languages,
  language = languages?.[0],
  storage = new Map(),
  storageDenied = false,
) {
  const heading = element();
  heading.dataset.i18n = "heading";
  const input = element();
  input.attributes["data-i18n-placeholder"] = "pairPlaceholder";
  const link = element();
  link.attributes["data-i18n-aria-label"] = "home";
  const languageSelect = element();
  languageSelect.attributes["data-i18n-aria-label"] = "language";
  const handlers = {};
  const document = {
    documentElement: { lang: "fr" },
    title: "Upstream title",
    querySelectorAll(selector) {
      if (selector === "[data-i18n]") return [heading];
      if (selector === "[data-i18n-placeholder]") return [input];
      if (selector === "[data-i18n-aria-label]") return [link, languageSelect];
      if (selector === "[data-relay-language]") return [languageSelect];
      return [];
    },
  };
  const localStorage = {
    getItem(key) {
      if (storageDenied) throw Error("storage denied");
      return storage.get(key) ?? null;
    },
    setItem(key, value) {
      if (storageDenied) throw Error("storage denied");
      storage.set(key, value);
    },
    removeItem(key) {
      if (storageDenied) throw Error("storage denied");
      storage.delete(key);
    },
  };
  const context = vm.createContext({
    window: {
      addEventListener(type, callback) {
        (handlers[type] ||= []).push(callback);
      },
    },
    navigator: { languages, language, serviceWorker: {} },
    document,
    localStorage,
    EventTarget,
    Event,
    MessageEvent,
    DOMException,
    Error,
    setTimeout,
    clearTimeout,
    TextEncoder,
    TextDecoder,
  });
  vm.runInContext(source, context);
  return {
    context,
    i18n: context.window.relayI18n,
    document,
    heading,
    input,
    link,
    languageSelect,
    handlers,
    storage,
  };
}

for (const [languages, expected] of [
  [["zh-CN"], "zh-CN"],
  [["zh-TW", "en"], "zh-CN"],
  [["ZH-hant-HK"], "zh-CN"],
  [["en-GB", "zh-CN"], "en"],
  [["fr-FR", "zh-CN", "en"], "zh-CN"],
  [["de-DE", "en-US"], "en"],
  [["ja-JP"], "ja"],
  [["JA"], "ja"],
  [["fr", "ja", "en"], "ja"],
  [[], "en"],
])
  assert.equal(createContext(languages).i18n.locale, expected);
assert.equal(createContext(undefined, "zh-SG").i18n.locale, "zh-CN");

{
  const { context, i18n, handlers, storage, languageSelect } = createContext([
    "zh-CN",
  ]);
  let notifications = 0;
  const unsubscribe = i18n.subscribe(() => notifications++);
  i18n.setPreference("en");
  assert.equal(i18n.locale, "en");
  assert.equal(storage.get("relay.language"), "en");
  assert.equal(
    createContext(["zh-CN"], "zh-CN", storage).i18n.locale,
    "en",
    "refresh preserves the explicit locale choice",
  );
  i18n.applyDocument();
  assert.equal(languageSelect.value, "en");
  languageSelect.value = "zh-CN";
  languageSelect.onchange();
  assert.equal(i18n.locale, "zh-CN");
  i18n.setPreference("auto");
  assert.equal(storage.has("relay.language"), false);
  context.navigator.languages = ["en-US"];
  handlers.languagechange[0]();
  assert.equal(
    i18n.locale,
    "en",
    "automatic mode follows browser language changes",
  );
  handlers.storage[0]({ key: "relay.language", newValue: "zh-CN" });
  assert.equal(i18n.locale, "zh-CN", "locale choice syncs across tabs");
  i18n.setPreference("ja");
  assert.equal(
    createContext(["en"], "en", storage).i18n.locale,
    "ja",
    "Japanese preference persists",
  );
  handlers.storage[0]({ key: "relay.language", newValue: "zh-CN" });
  assert.throws(() => i18n.setPreference("invalid"), /Invalid Relay language/);
  assert.equal(i18n.preference, "zh-CN");
  unsubscribe();
  const before = notifications;
  i18n.setPreference("en");
  assert.equal(notifications, before);
  const denied = createContext(["zh-CN"], "zh-CN", new Map(), true).i18n;
  denied.setPreference("en");
  assert.equal(
    denied.locale,
    "en",
    "locale can change in the current tab when storage is disabled",
  );
  assert.equal(
    createContext(["zh-CN"], "zh-CN", new Map([["relay.language", "invalid"]]))
      .i18n.locale,
    "zh-CN",
  );
}

for (const locale of ["en", "zh-CN", "ja"]) {
  const { context, i18n, document, heading, input, link } = createContext([
    locale,
  ]);
  i18n.applyDocument();
  assert.equal(document.documentElement.lang, locale);
  assert.equal(document.title, dictionaries[locale].pageTitle);
  assert.equal(heading.textContent, dictionaries[locale].heading);
  assert.equal(
    input.attributes.placeholder,
    dictionaries[locale].pairPlaceholder,
  );
  assert.equal(link.attributes["aria-label"], dictionaries[locale].home);
  assert.equal(
    i18n.t("upstreamHTTP", { status: 401 }),
    dictionaries[locale].upstreamHTTP.replace("{status}", "401"),
  );
  assert.throws(() => i18n.t("unknown-test-key"), /Missing Relay translation/);

  const exports = {};
  context.exports = exports;
  context.require = () => ({ t: i18n.t });
  vm.runInContext(
    ts.transpileModule(read("src/connection-copy.ts"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    context,
  );
  for (const [raw, message, recovery] of [
    ["invalid addr", "pairInvalid", "pairInvalidRecovery"],
    ["WASM download failed", "engineFailed", "engineRecovery"],
    [
      "The browser does not support Service Workers",
      "browserUnsupported",
      "browserRecovery",
    ],
    ["Page bridge failed to initialize", "appNotReady", "appRecovery"],
    ["Entry response is not HTML", "noHTML", "noHTMLRecovery"],
    ["Bandwidth probe mode", "probeOnly", "probeRecovery"],
    ["timeout", "timeout", "timeoutRecovery"],
    ["Tunnel disconnected", "connectionClosed", "closedRecovery"],
    ["Probe integrity check failed", "integrityFailed", "integrityRecovery"],
    ["unknown", "operationFailed", "operationRecovery"],
  ]) {
    const result = exports.connectionError(new Error(raw));
    assert.equal(result.message, i18n.t(message));
    assert.equal(result.recovery, i18n.t(recovery));
  }
  assert.equal(
    exports.connectionError(new Error("upstream returned HTTP 403; secret-url"))
      .message,
    i18n.t("upstreamHTTP", { status: 403 }),
  );
  for (const [raw, key] of [
    ["Loading encryption engine (about 6.3 MB)", "loadingEngine"],
    [
      "Checking for a local direct connection (up to 12 seconds)",
      "tryingDirect",
    ],
    [
      "Could not establish a direct connection; continuing through the public DERP relay (check the firewall, Wi-Fi isolation, or connector version)",
      "usingRelay",
    ],
    [
      "Local direct connection established; application data does not use the public DERP relay",
      "directReady",
    ],
  ]) {
    assert.equal(exports.connectionProgress(raw), i18n.t(key));
  }
  const retained = exports.connectionError(new Error("timeout"));
  i18n.setPreference(locale === "en" ? "zh-CN" : "en");
  assert.equal(
    retained.message,
    i18n.t("timeout"),
    "visible errors update immediately when the locale changes",
  );
}

const files = [
  "src/App.tsx",
  "src/QuickInstall.tsx",
  "src/RelayHelp.tsx",
  "src/LanguageSelect.tsx",
  "src/connection-copy.ts",
  "src/standalone.ts",
  "public/__relay/runtime.js",
];
for (const file of files) {
  for (const match of read(file).matchAll(/\b(?:t|tr)\('([^']+)'/g))
    assert.ok(keys.includes(match[1]), `${file}:${match[1]}`);
}
for (const match of read("src/standalone.html").matchAll(
  /data-i18n(?:-placeholder|-aria-label)?="([^"]+)"/g,
)) {
  assert.ok(keys.includes(match[1]), `standalone entry: ${match[1]}`);
}

for (const locale of ["en", "zh-CN", "ja"]) {
  const { context, i18n, document } = createContext([locale]);
  const controls = Object.fromEntries(
    [
      "summary",
      "details",
      "#full",
      "#new-tab",
      "#disconnect",
      "#reconnect",
      "#route",
      "#language-menu",
      ".language-options",
    ].map((key) => [key, element()]),
  );
  controls["#reconnect"].hidden = true;
  const shadow = { querySelector: (selector) => controls[selector] };
  const host = { style: {}, attachShadow: () => shadow };
  document.createElement = () => host;
  document.readyState = "complete";
  document.addEventListener = () => {};
  document.body = { append() {} };
  const relay = {
    transport: "direct",
    closeCount: 0,
    close() {
      this.closeCount++;
      this.onClose?.();
    },
  };
  context.window.tailcatRelay = relay;
  context.window.WebSocket = class {};
  context.window.addEventListener = () => {};
  context.window.relayPairAddress = "temporary-test-address";
  let mounted = false;
  context.window.telayLanguageMenu = {
    mount(target) {
      assert.equal(target, controls["#language-menu"]);
      mounted = true;
      return () => {};
    },
  };
  vm.runInContext(read("public/__relay/runtime.js"), context);
  assert.ok(mounted, "runtime reuses the shared language menu");
  assert.equal(controls[".language-options"].style.bottom, "100%");
  assert.equal(host.lang, locale);
  assert.equal(
    document.documentElement.lang,
    "fr",
    "the upstream document language is unchanged",
  );
  assert.equal(
    document.title,
    "Upstream title",
    "the upstream document title is unchanged",
  );
  assert.equal(
    controls.summary.attributes["aria-label"],
    i18n.t("connectionOptions"),
  );
  assert.equal(controls["#route"].textContent, i18n.t("connectedDirect"));
  for (const [id, key] of [
    ["#full", "fullscreen"],
    ["#new-tab", "newTab"],
    ["#disconnect", "disconnect"],
    ["#reconnect", "reconnect"],
  ]) {
    assert.equal(controls[id].textContent, i18n.t(key));
  }
  assert.equal(controls["#reconnect"].hidden, true);
  relay.transport = "relay";
  relay.onTransport();
  assert.equal(controls["#route"].textContent, i18n.t("connectedRelay"));
  i18n.setPreference(locale === "en" ? "ja" : "en");
  assert.equal(host.lang, i18n.locale);
  assert.equal(controls["#route"].textContent, i18n.t("connectedRelay"));
  assert.equal(controls["#disconnect"].textContent, i18n.t("disconnect"));
  assert.equal(document.documentElement.lang, "fr");
  assert.equal(
    relay.closeCount,
    0,
    "changing the locale does not close the connection",
  );
  controls["#disconnect"].onclick();
  assert.equal(controls["#route"].textContent, i18n.t("closedPairAgain"));
  assert.equal(controls["#reconnect"].hidden, false);
  assert.equal(controls["#new-tab"].disabled, true);
}
console.log(
  `PASS i18n: ${keys.length} trilingual entries, locale preference/sync, entry and error mapping, live menu updates, connection persistence`,
);
