// Isolated checks for streaming protocols, page ports, and the Service Worker bridge.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { gzipSync } from "node:zlib";
import ts from "typescript";
const read = (file) =>
  readFileSync(new URL("../" + file, import.meta.url), "utf8");
const globals = {
  ReadableStream,
  DecompressionStream,
  TextDecoder,
  TextEncoder,
  Uint8Array,
  ArrayBuffer,
  Blob,
  Response,
  Request,
  URL,
  MessageChannel,
  AbortController,
  setTimeout,
  clearTimeout,
  btoa,
  atob,
};
const load = (file) => {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(read(file), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    { exports, ...globals },
  );
  return exports;
};
const { receiveHTTP } = load("src/http-stream.ts");
const { serveHTTPPort } = load("src/http-port.ts");
const self = {};
vm.runInNewContext(read("public/__relay/http-response.js"), {
  self,
  ...globals,
});
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function streamHarness(signal, timeout = 100) {
  let listener;
  const sent = [];
  const promise = receiveHTTP(
    1,
    async (frame) => {
      sent.push(frame);
    },
    (value) => {
      listener = value;
    },
    () => {
      listener = undefined;
    },
    (body) => Uint8Array.from(Buffer.from(body || "", "base64")),
    timeout,
    signal,
  );
  return {
    promise,
    sent,
    emit: (frame) => listener?.({ id: 1, ...frame }),
    active: () => !!listener,
  };
}
{
  const h = streamHarness();
  const body = Buffer.from("chunked response");
  h.emit({ op: "result-head", status: 200, headers: { "Content-Type": "text/plain" } });
  h.emit({ op: "result-part", body: body.subarray(0, 6).toString("base64") });
  h.emit({ op: "result-part", body: body.subarray(6).toString("base64") });
  h.emit({ op: "result-end" });
  const result = await h.promise;
  assert.equal(Buffer.from(result.body, "base64").toString(), body.toString());
  assert.equal(result.status, 200);
}
{
  const h = streamHarness();
  const body = Buffer.from("compressed response ".repeat(100));
  const gzip = gzipSync(body);
  const split = Math.floor(gzip.length / 6) * 3;
  h.emit({ op: "result-head", status: 200, encoding: "gzip" });
  h.emit({ op: "result-part", body: gzip.subarray(0, split).toString("base64") });
  h.emit({ op: "result-part", body: gzip.subarray(split).toString("base64") });
  h.emit({ op: "result-end" });
  assert.deepEqual(Buffer.from((await h.promise).body, "base64"), body);
}
{
  const h = streamHarness(undefined, 80);
  h.emit({ op: "result-head", status: 200 });
  await pause(50);
  h.emit({ op: "result-part", body: Buffer.from("abc").toString("base64") });
  await pause(50);
  h.emit({ op: "result-end" });
  assert.equal(Buffer.from((await h.promise).body, "base64").toString(), "abc");
}
{
  const h = streamHarness(undefined, 15);
  h.emit({
    op: "http-head",
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
  const result = await h.promise;
  assert.equal(result.status, 200);
  await pause(30);
  assert.ok(
    h.active(),
    "stream remains active beyond the ordinary HTTP timeout",
  );
  assert.equal(h.sent.length, 0, "does not pre-read");
  const reader = result.stream.getReader();
  const first = reader.read();
  await pause(1);
  assert.equal(h.sent[0].op, "http-pull");
  h.emit({
    op: "http-data",
    body: Buffer.from("data: café 🌱\n\n").toString("base64"),
  });
  assert.equal(
    new TextDecoder().decode((await first).value),
    "data: café 🌱\n\n",
  );
  const end = reader.read();
  await pause(1);
  h.emit({ op: "http-end" });
  assert.equal((await end).done, true);
  assert.equal(h.active(), false);
}
{
  const h = streamHarness();
  h.emit({ op: "http-head", status: 200 });
  const r = (await h.promise).stream.getReader();
  const next = r.read();
  await pause(1);
  h.emit({ op: "http-error", error: "upstream request failed" });
  await assert.rejects(next, /upstream request failed/);
  assert.equal(h.active(), false);
}
{
  const h = streamHarness();
  h.emit({ op: "http-head", status: 200 });
  const result = await h.promise;
  await result.stream.cancel();
  assert.equal(h.sent.at(-1).op, "http-cancel");
  assert.equal(h.active(), false);
}
{
  const abort = new AbortController();
  const h = streamHarness(abort.signal);
  abort.abort();
  await assert.rejects(h.promise, /canceled/);
  assert.equal(h.sent.at(-1).op, "http-cancel");
  assert.equal(h.active(), false);
}
{
  const h = streamHarness(undefined, 5);
  await assert.rejects(h.promise, /timed out/);
  assert.equal(h.sent.at(-1).op, "http-cancel");
}
{
  const h = streamHarness();
  h.emit({ op: "result", status: 304, headers: { ETag: '"v1"' } });
  assert.equal(
    (await h.promise).status,
    304,
    "ordinary HTTP keeps 304 responses",
  );
  assert.equal(h.active(), false);
}
function portHarness(request, signal = new AbortController().signal) {
  let life;
  const event = {
    request: { signal },
    waitUntil(promise) {
      life = promise;
    },
  };
  const target = {
    postMessage(_message, ports) {
      void serveHTTPPort(ports[0], request);
    },
  };
  return {
    response: self.relayHTTPResponse(event, target, {
      op: "relay-http",
      method: "GET",
    }),
    life: () => life,
  };
}
{
  const h = streamHarness();
  const port = portHarness(() => h.promise);
  h.emit({
    op: "http-head",
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
    },
  });
  const response = await port.response;
  assert.equal(response.headers.get("content-type"), "text/event-stream");
  await pause(10);
  assert.equal(h.sent.length, 0, "neither port pre-reads");
  const reader = response.body.getReader();
  const first = reader.read();
  await pause(10);
  assert.equal(h.sent.length, 1);
  h.emit({
    op: "http-data",
    body: Buffer.from("id: 7\ndata: event-one\n\n").toString("base64"),
  });
  assert.equal(
    new TextDecoder().decode((await first).value),
    "id: 7\ndata: event-one\n\n",
  );
  await pause(10);
  assert.equal(
    h.sent.length,
    1,
    "a slow consumer does not request more credit",
  );
  await reader.cancel();
  await port.life();
  await pause(10);
  assert.equal(h.sent.at(-1).op, "http-cancel");
  assert.equal(h.active(), false);
}
{
  const abort = new AbortController();
  let aborted = false;
  const pending = portHarness(
    (value) =>
      new Promise((_resolve, reject) =>
        value.addEventListener("abort", () => {
          aborted = true;
          reject(new Error("Request cancelled"));
        }),
      ),
    abort.signal,
  );
  abort.abort();
  await assert.rejects(pending.response, /Request canceled/);
  await pause(10);
  assert.equal(aborted, true);
}
{
  const port = portHarness(async () => ({
    status: 200,
    headers: { "Content-Type": "text/plain" },
    body: btoa("cached body"),
  }));
  assert.equal(await (await port.response).text(), "cached body");
  await port.life();
}
{
  const h = streamHarness();
  const port = portHarness(() => h.promise);
  h.emit({ op: "http-head", status: 200 });
  const response = await port.response;
  h.emit({ op: "http-error", error: "idle stream disconnected" });
  await port.life();
  await assert.rejects(
    response.body.getReader().read(),
    /idle stream disconnected/,
  );
}
console.log(
  "PASS streaming: early headers, long-lived streams, one-chunk backpressure, ports, cancellation, timeout, disconnect errors, ordinary responses",
);
{
  const handlers = {};
  let forwarded;
  const worker = {
    location: new URL("https://telay.test/"),
    addEventListener: (type, fn) => { handlers[type] = fn; },
    importScripts() {},
    clients: { get: async () => ({
      postMessage(_message, ports) { ports[0].postMessage({ active: true }); },
    }) },
    relayHTTPResponse(_event, _target, message) {
      forwarded = message;
      return new Response("ok");
    },
  };
  vm.runInNewContext(read("public/bridge-sw.js"), {
    self: worker, MessageChannel, URL, Response, Uint8Array, btoa, setTimeout, clearTimeout,
  });
  let response;
  handlers.fetch({
    request: new Request("https://telay.test/orchestrator/api/state", {
      headers: { "x-orchestrator-request": "1", authorization: "Bearer test" },
    }),
    clientId: "test",
    respondWith(value) { response = value; },
  });
  await response;
  assert.equal(forwarded.headers["x-orchestrator-request"], "1");
  assert.equal(forwarded.headers.authorization, "Bearer test");
}
