// Isolated checks; do not contact a real relay, model, or user service.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import CachePolicy from "http-cache-semantics";
import { webcrypto } from "node:crypto";
const read = (file) =>
  readFileSync(new URL("../" + file, import.meta.url), "utf8");
const token = (index) => "tc" + String(index).padStart(40, "a");
function history(saved = "[]", denied = false) {
  const storage = new Map([["relay.recent.v1", saved]]);
  const listeners = {};
  const window = {
    addEventListener(type, callback) {
      (listeners[type] ||= []).push(callback);
    },
    dispatchEvent(event) {
      for (const listener of listeners[event.type] || []) listener(event);
    },
  };
  const localStorage = {
    getItem(key) {
      if (denied) throw Error("denied");
      return storage.get(key);
    },
    setItem(key, value) {
      if (denied) throw Error("denied");
      storage.set(key, value);
    },
    removeItem(key) {
      if (denied) throw Error("denied");
      storage.delete(key);
    },
  };
  vm.runInNewContext(read("public/__relay/history.js"), {
    window,
    localStorage,
    Event,
  });
  return { history: window.relayHistory, storage, listeners };
}
{
  const { history: h, storage, listeners } = history();
  let notified = 0;
  const stop = h.subscribe(() => notified++);
  for (let i = 0; i < 7; i++)
    assert.equal(h.save(token(i), "Device " + i), true);
  assert.equal(h.entries.length, 5);
  assert.equal(h.entries[0].address, token(6));
  h.save(token(4));
  assert.equal(h.entries[0].address, token(4));
  assert.equal(h.entries[0].title, "Device 4");
  assert.equal(h.entries.filter((item) => item.address === token(4)).length, 1);
  assert.equal(
    history(storage.get("relay.recent.v1")).history.entries[0].address,
    token(4),
  );
  assert.equal(h.save("not-a-pair"), false);
  h.save(token(2), "\u0000" + "x".repeat(100));
  assert.equal(h.entries[0].title.length, 60);
  storage.delete("relay.recent.v1");
  listeners.storage[0]({ key: "relay.recent.v1" });
  assert.equal(h.entries.length, 0);
  h.save(token(1));
  h.clear();
  assert.equal(storage.has("relay.recent.v1"), false);
  assert.equal(h.entries.length, 0);
  stop();
  const before = notified;
  h.save(token(0));
  assert.equal(before, notified);
  assert.equal(history("{broken").history.entries.length, 0);
  assert.equal(history('{"address":"invalid"}').history.entries.length, 0);
  const denied = history("[]", true).history;
  assert.equal(denied.save(token(1)), false);
  assert.equal(denied.persisted, false);
  assert.equal(denied.entries.length, 1);
  denied.clear();
  assert.equal(denied.entries.length, 0);
}
function cacheEnvironment(denied = false) {
  const stores = new Map();
  const varyMatch = (saved, request) =>
    saved.request.url === request.url &&
    (saved.response.headers.get("vary") || "")
      .split(",")
      .filter(Boolean)
      .every(
        (name) =>
          saved.request.headers.get(name.trim()) ===
          request.headers.get(name.trim()),
      );
  const caches = {
    async open(name) {
      if (denied) throw Error("denied");
      if (!stores.has(name)) stores.set(name, []);
      const entries = stores.get(name);
      return {
        async match(request) {
          return entries
            .find((item) => varyMatch(item, request))
            ?.response.clone();
        },
        async put(request, response) {
          const index = entries.findIndex(
            (item) => item.request.url === request.url,
          );
          if (index >= 0) entries.splice(index, 1);
          entries.push({
            request: request.clone(),
            response: response.clone(),
          });
        },
        async delete(request) {
          const index = entries.findIndex((item) => varyMatch(item, request));
          if (index >= 0) entries.splice(index, 1);
        },
        async keys() {
          return entries.map((item) => item.request);
        },
      };
    },
    async delete(name) {
      return stores.delete(name);
    },
    async keys() {
      return [...stores.keys()];
    },
  };
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(read("src/http-cache.ts"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    {
      exports,
      require: () => CachePolicy,
      window: { addEventListener() {} },
      Request,
      Response,
      URL,
      TextEncoder,
      caches,
      Date,
      crypto: webcrypto,
    },
  );
  return {
    make: (name) => new exports.HTTPCache(name, "https://relay.test"),
    stores,
  };
}
const response = (headers, value = "one", status = 200) => ({
  status,
  headers,
  body: Buffer.from(value).toString("base64"),
});
const text = (value) => Buffer.from(value.body, "base64").toString();
for (const cc of ["public, max-age=600", "private, max-age=600"]) {
  const { make } = cacheEnvironment();
  const c = make("device");
  let calls = 0;
  const origin = async () => {
    calls++;
    return response({ "Cache-Control": cc, ETag: '"v1"' });
  };
  assert.equal(
    text(await c.request("/asset", "GET", {}, "", "default", origin)),
    "one",
  );
  assert.equal(
    text(
      await make("device").request("/asset", "GET", {}, "", "default", origin),
    ),
    "one",
  );
  assert.equal(
    calls,
    1,
    "a refresh/new instance reuses a valid response for the same device",
  );
  await make("other-device").request(
    "/asset",
    "GET",
    {},
    "",
    "default",
    origin,
  );
  assert.equal(calls, 2, "devices are isolated");
}
for (const header of [
  { "Cache-Control": "no-cache", ETag: '"v1"' },
  { "Cache-Control": "max-age=0", ETag: '"v1"' },
  {
    "Cache-Control": "max-age=0",
    "Last-Modified": "Tue, 03 Nov 2026 00:00:00 GMT",
  },
]) {
  const { make } = cacheEnvironment();
  const c = make("device");
  let calls = 0;
  const origin = async (_path, _method, h) => {
    calls++;
    if (calls > 1) {
      assert.ok(h["if-none-match"] || h["if-modified-since"]);
      return response(header, "", 304);
    }
    return response(header);
  };
  await c.request("/asset", "GET", {}, "", "default", origin);
  assert.equal(
    text(await c.request("/asset", "GET", {}, "", "default", origin)),
    "one",
  );
  assert.equal(calls, 2, "expired/forced validation uses 304");
}
{
  const { make } = cacheEnvironment();
  const c = make("device");
  let calls = 0;
  let version = "one";
  const origin = async () => {
    calls++;
    return response(
      { "Cache-Control": "no-cache", ETag: '"' + version + '"' },
      version,
    );
  };
  await c.request("/asset", "GET", {}, "", "default", origin);
  version = "two";
  assert.equal(
    text(await c.request("/asset", "GET", {}, "", "default", origin)),
    "two",
  );
  assert.equal(calls, 2);
}
for (const headers of [
  { "Cache-Control": "no-store" },
  {},
  { "Cache-Control": "max-age=600", Vary: "*" },
  { "Cache-Control": "max-age=600", Vary: "Cookie" },
]) {
  const { make, stores } = cacheEnvironment();
  const c = make("device");
  let calls = 0;
  const origin = async () => {
    calls++;
    return response(headers);
  };
  await c.request("/asset", "GET", {}, "", "default", origin);
  await c.request("/asset", "GET", {}, "", "default", origin);
  assert.equal(calls, 2);
  assert.ok(
    [...stores.values()].every((entries) => !entries.length),
    "disallowed/ambiguous responses are not persisted",
  );
}
{
  const { make } = cacheEnvironment();
  const c = make("device");
  let calls = 0;
  const origin = async (_p, _m, h) => {
    calls++;
    return response(
      { "Cache-Control": "max-age=600", Vary: "Accept-Language" },
      h["accept-language"],
    );
  };
  for (const language of ["en", "zh-CN", "en", "zh-CN"])
    assert.equal(
      text(
        await c.request(
          "/asset",
          "GET",
          { "Accept-Language": language },
          "",
          "default",
          origin,
        ),
      ),
      language,
    );
  assert.equal(calls, 2, "Vary separates language representations");
}
{
  const { make } = cacheEnvironment();
  const c = make("device");
  let calls = 0;
  const origin = async () => {
    calls++;
    return response({ "Cache-Control": "max-age=600", ETag: '"v1"' });
  };
  await c.request("/asset", "GET", {}, "", "default", origin);
  await c.request("/asset", "POST", {}, "", "default", origin);
  await c.request("/asset", "GET", {}, "", "default", origin);
  assert.equal(calls, 3, "writes invalidate cached entries");
  await c.request("/asset", "GET", {}, "", "reload", origin);
  assert.equal(calls, 4);
  await c.request("/asset", "GET", {}, "", "no-store", origin);
  assert.equal(calls, 5);
  const missing = await c.request(
    "/missing",
    "GET",
    {},
    "",
    "only-if-cached",
    origin,
  );
  assert.equal(missing.status, 504);
  assert.equal(calls, 5);
}
{
  const { make } = cacheEnvironment();
  const c = make("device");
  let calls = 0;
  const origin = async () => {
    calls++;
    return response({
      "Cache-Control": "max-age=30",
      Date: new Date(Date.now() - 60000).toUTCString(),
    });
  };
  await c.request("/asset", "GET", {}, "", "default", origin);
  await c.request("/asset", "GET", {}, "", "default", origin);
  assert.equal(calls, 2, "an old Date must not extend freshness");
}
{
  const { make } = cacheEnvironment(true);
  let calls = 0;
  const origin = async () => {
    calls++;
    return response({ "Cache-Control": "max-age=600" });
  };
  await make("d").request("/asset", "GET", {}, "", "default", origin);
  await make("d").request("/asset", "GET", {}, "", "default", origin);
  assert.equal(calls, 2);
}
{
  const { make } = cacheEnvironment();
  const c = make("device");
  let calls = 0;
  const origin = async (_p, _m, h) => {
    calls++;
    if (h["if-none-match"]) return response({ ETag: '"different"' }, "", 304);
    return response(
      { "Cache-Control": "no-cache", ETag: '"v1"' },
      calls === 1 ? "one" : "two",
    );
  };
  await c.request("/asset", "GET", {}, "", "default", origin);
  assert.equal(
    text(await c.request("/asset", "GET", {}, "", "default", origin)),
    "two",
  );
  assert.equal(calls, 3, "a mismatched 304 fetches a fresh body");
}
{
  const { make, stores } = cacheEnvironment();
  const c = make("device");
  let calls = 0;
  const origin = async () => {
    calls++;
    return {
      ...response({
        "Cache-Control": "max-age=600",
        "Content-Type": "text/event-stream",
      }),
      stream: new ReadableStream({
        start(controller) {
          controller.close();
        },
      }),
    };
  };
  for (let i = 0; i < 2; i++)
    assert.ok(
      (await c.request("/events", "GET", {}, "", "default", origin)).stream,
    );
  assert.equal(calls, 2);
  assert.ok(
    [...stores.values()].every((entries) => !entries.length),
    "SSE responses are never stored in the full-response cache",
  );
}
console.log(
  "PASS address history and HTTP cache: validation, isolation, freshness, 304/fresh body, no-store/Vary, write invalidation, cache modes, SSE bypass, and fallback",
);
