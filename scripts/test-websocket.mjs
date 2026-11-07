import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const runtime = readFileSync(
  new URL("../public/__relay/runtime.js", import.meta.url), "utf8",
).split("  // Expose no DSH-specific globals;")[0] + "})();";

function socketHarness() {
  let receive;
  const relay = {
    openSocket(_path, listener) { receive = listener; return 1; },
    socketClose() {},
  };
  const window = {
    tailcatRelay: relay,
    relayI18n: { t: (key) => key },
    WebSocket: class {},
  };
  class CloseEvent extends Event {
    constructor(type, options) {
      super(type);
      Object.assign(this, options);
    }
  }
  vm.runInNewContext(runtime, {
    window, location: new URL("https://telay.test/__relay/view/"), URL,
    EventTarget, Event, MessageEvent, CloseEvent, DOMException,
    TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, Blob, atob, btoa,
  });
  const socket = new window.WebSocket("wss://telay.test/ws");
  receive({ op: "ws-opened" });
  return { socket, receive };
}

test("upstream close code and UTF-8 reason follow the complete message", () => {
  const { socket, receive } = socketHarness();
  const events = [];
  socket.onmessage = (event) => events.push(["message", event.data]);
  socket.onerror = () => assert.fail("policy close is not a transport error");
  socket.onclose = (event) => events.push(["close", event.code, event.reason, event.wasClean]);
  const text = Buffer.from("baseline 🌱");
  receive({ op: "ws-data-head", type: 1 });
  receive({ op: "ws-data-part", body: text.subarray(0, 3).toString("base64") });
  receive({ op: "ws-data-part", body: text.subarray(3).toString("base64") });
  receive({ op: "ws-data-end" });
  receive({ op: "ws-closed", code: 1008, reason: "policy 🌱", wasClean: true });
  assert.deepEqual(events, [["message", "baseline 🌱"], ["close", 1008, "policy 🌱", true]]);
  assert.equal(socket.readyState, socket.CLOSED);
});

test("abrupt upstream and tunnel failures emit error then abnormal close once", () => {
  for (const frame of [
    { op: "ws-closed", code: 1006, error: "EOF" },
    { op: "ws-error", error: "Tunnel closed." },
    { op: "ws-error", error: "upstream WebSocket receive buffer exceeded" },
  ]) {
    const { socket, receive } = socketHarness();
    const events = [];
    socket.onerror = () => {
      assert.equal(socket.readyState, socket.CLOSED);
      events.push("error");
      socket.close(); // A common application cleanup must not duplicate close.
    };
    socket.onclose = (event) => events.push([event.code, event.reason, event.wasClean]);
    receive(frame);
    receive(frame);
    assert.deepEqual(events, ["error", [1006, "", false]]);
  }
});

test("older connectors without close metadata retain their existing behavior", () => {
  const { socket, receive } = socketHarness();
  let closed;
  socket.onclose = (event) => { closed = event; };
  receive({ op: "ws-closed" });
  assert.equal(closed.code, 1000);
  assert.equal(closed.wasClean, true);
});
