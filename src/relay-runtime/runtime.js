(() => {
  const appBase = new URL("../", document.currentScript.src).pathname;
  const appPath = (path) => appBase + path.replace(/^\/+/, "");
  const viewPrefix = appPath("__relay/view");
  const { t } = window.relayI18n;
  const relay = window.tailcatRelay;
  if (!relay) throw new Error(t("relayNotInitialized"));
  const NativeWebSocket = window.WebSocket;
  const sockets = new Set();
  function encode(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i += 32768)
      s += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return btoa(s);
  }
  function decode(s) {
    return Uint8Array.from(atob(s || ""), (c) => c.charCodeAt(0));
  }
  class RelayWebSocket extends EventTarget {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    CONNECTING = 0;
    OPEN = 1;
    CLOSING = 2;
    CLOSED = 3;
    readyState = 0;
    binaryType = "blob";
    bufferedAmount = 0;
    extensions = "";
    protocol = "";
    onopen = null;
    onmessage = null;
    onerror = null;
    onclose = null;
    constructor(url, protocols) {
      super();
      const u = new URL(url, location.href);
      if (!["ws:", "wss:"].includes(u.protocol) || u.hash)
        throw new DOMException(t("socketInvalid"), "SyntaxError");
      // External WebSockets, including Tailcat DERP connections, must not re-enter the application tunnel.
      if (u.host !== location.host) return new NativeWebSocket(url, protocols);
      this.url = u.href;
      this._queue = Promise.resolve();
      sockets.add(this);
      const path =
        (u.pathname.startsWith(viewPrefix + "/")
          ? u.pathname.slice(viewPrefix.length)
          : u.pathname) + u.search;
      this._id = relay.openSocket(
        path,
        (frame) => {
          if (frame.op === "ws-opened") {
            this.protocol = frame.protocol || "";
            this.readyState = 1;
            this.emit("open", new Event("open"));
          }
          if (frame.op === "ws-data") {
            const bytes = decode(frame.body);
            this.emit(
              "message",
              new MessageEvent("message", {
                data:
                  frame.type === 1
                    ? new TextDecoder().decode(bytes)
                    : this.binaryType === "arraybuffer"
                      ? bytes.buffer
                      : new Blob([bytes]),
              }),
            );
          }
          if (frame.op === "ws-error") this.emit("error", new Event("error"));
          if (frame.op === "ws-closed" || frame.op === "ws-error") {
            sockets.delete(this);
            this.readyState = 3;
            this.emit(
              "close",
              new CloseEvent("close", {
                code: frame.op === "ws-error" ? 1006 : 1000,
                wasClean: frame.op !== "ws-error",
              }),
            );
          }
        },
        typeof protocols === "string" ? [protocols] : protocols || [],
      );
    }
    emit(type, event) {
      this.dispatchEvent(event);
      this["on" + type]?.call(this, event);
    }
    send(data) {
      if (this.readyState !== 1)
        throw new DOMException(t("socketNotOpen"), "InvalidStateError");
      const size =
        typeof data === "string"
          ? new TextEncoder().encode(data).length
          : (data.size ?? data.byteLength);
      this.bufferedAmount += size;
      this._queue = this._queue
        .then(async () => {
          const type = typeof data === "string" ? 1 : 2;
          const bytes =
            type === 1
              ? new TextEncoder().encode(data)
              : data instanceof Blob
                ? new Uint8Array(await data.arrayBuffer())
                : data instanceof ArrayBuffer
                  ? new Uint8Array(data)
                  : new Uint8Array(
                      data.buffer,
                      data.byteOffset,
                      data.byteLength,
                    );
          await relay.socketSend(this._id, encode(bytes), type);
          this.bufferedAmount -= size;
        })
        .catch(() => this.close());
    }
    close() {
      if (this.readyState === 3) return;
      sockets.delete(this);
      relay.socketClose(this._id);
      this.readyState = 3;
      this.emit(
        "close",
        new CloseEvent("close", { code: 1000, wasClean: true }),
      );
    }
  }
  window.WebSocket = RelayWebSocket;
  // Expose no DSH-specific globals; upstream apps use standard HTTP and WebSocket APIs.
  navigator.serviceWorker.register = () =>
    Promise.reject(new Error(t("appSWUnsupported")));
  window.addEventListener("pagehide", () => {
    for (const socket of sockets) socket.close();
    relay.close();
  });
  function controls() {
    const host = document.createElement("div");
    host.id = "telay-controls";
    host.lang = window.relayI18n.locale;
    host.style.cssText =
      "position:fixed;bottom:12px;right:12px;z-index:2147483647";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML =
      '<style>:host{font:12px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#302d29}details{position:relative}summary{list-style:none;cursor:pointer;background:#f7f5f0;border:1px solid #d4cfc5;border-radius:8px;min-height:44px;padding:0 14px;display:flex;align-items:center;box-sizing:border-box}summary::-webkit-details-marker{display:none}.panel{position:absolute;right:0;bottom:54px;width:240px;max-width:calc(100vw - 24px);max-height:calc(100svh - 100px);overflow:auto;box-sizing:border-box;padding:8px;background:#f7f5f0;border:1px solid #d4cfc5;border-radius:12px}button,a{font:inherit;display:block;box-sizing:border-box;min-height:44px;width:100%;padding:12px 10px;color:inherit;text-align:left;border:0;background:transparent;border-radius:6px;cursor:pointer;text-decoration:none}button:hover,a:hover{background:#eeebe4}button:disabled{opacity:.5;cursor:not-allowed}summary:focus-visible,button:focus-visible,a:focus-visible{outline:2px solid #a74d35;outline-offset:2px}p{margin:4px 10px 8px;line-height:1.6;color:#6c675f}::selection{background:#e9d1c3;color:#302d29}[hidden]{display:none}</style><details><summary aria-label="">Telay</summary><div class="panel"><p id="route" role="status"></p><button id="full"></button><button id="new-tab"></button><button id="disconnect"></button><a id="reconnect" hidden></a><div id="language-menu"></div></div></details>';
    root.querySelector("#reconnect").href = appPath("__relay/index.html");
    const route = root.querySelector("#route");
    const removeLanguageMenu = window.telayLanguageMenu.mount(
      root.querySelector("#language-menu"),
    );
    window.addEventListener("pagehide", removeLanguageMenu, { once: true });
    const languageOptions = root.querySelector(".language-options");
    languageOptions.style.top = "auto";
    languageOptions.style.bottom = "100%";
    let notice;
    const update = () => {
      host.lang = window.relayI18n.locale;
      root
        .querySelector("summary")
        .setAttribute("aria-label", t("connectionOptions"));
      for (const [id, key] of [
        ["new-tab", "newTab"],
        ["disconnect", "disconnect"],
        ["reconnect", "reconnect"],
      ])
        root.querySelector("#" + id).textContent = t(key);
      root.querySelector("#full").textContent = t(
        document.fullscreenElement ? "exitFullscreen" : "fullscreen",
      );
      route.textContent = t(
        notice ||
          (relay.transport === "direct" ? "connectedDirect" : "connectedRelay"),
      );
    };
    const unsubscribe = window.relayI18n.subscribe(update);
    window.addEventListener("pagehide", unsubscribe, { once: true });
    update();
    relay.onTransport = () => {
      notice = undefined;
      update();
    };
    const newTab = root.querySelector("#new-tab");
    newTab.disabled = !window.relayPairAddress;
    newTab.onclick = () => {
      if (!window.relayPairAddress) return;
      window.open(
        appPath("__relay/index.html#pair=") +
          encodeURIComponent(window.relayPairAddress),
        "_blank",
        "noopener,noreferrer",
      );
      relay.close();
    };
    relay.onClose = () => {
      notice = "closedPairAgain";
      update();
      newTab.disabled = true;
      root.querySelector("#reconnect").hidden = false;
      root.querySelector("#disconnect").disabled = true;
      delete window.relayPairAddress;
      root.querySelector("details").open = true;
    };
    root.querySelector("#disconnect").onclick = () => relay.close();
    root.querySelector("#full").onclick = async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else if (document.documentElement.requestFullscreen)
          await document.documentElement.requestFullscreen();
        else {
          notice = "fullscreenUnsupported";
          update();
        }
      } catch {
        notice = "fullscreenDenied";
        update();
      }
    };
    document.addEventListener("fullscreenchange", () => {
      if (notice !== "closedPairAgain") notice = undefined;
      update();
    });
    document.body.append(host);
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", controls, { once: true });
  else controls();
})();
