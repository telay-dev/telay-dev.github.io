import { localDirect } from "./direct";
import { deviceCache, HTTPCache } from "./http-cache";
import { receiveHTTP } from "./http-stream";
import { activateBridge } from "./bridge";
import { connectionProgressKey } from "./connection-copy";
type Conn = {
  read(): Promise<Uint8Array | null>;
  write(data: Uint8Array): Promise<void>;
  close(): void;
};
type Frame = {
  id: number;
  op: string;
  path?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  status?: number;
  error?: string;
  type?: number;
  size?: number;
  ms?: number;
  encoding?: string;
  protocols?: string[];
  protocol?: string;
  code?: number;
  reason?: string;
  wasClean?: boolean;
  sdp?: string;
  stream?: boolean;
  chunked?: boolean;
  capabilities?: string[];
  hostname?: string;
};
declare global {
  interface Window {
    tailcatDial(opts: object): Promise<Conn>;
    Go: new () => {
      importObject: WebAssembly.Imports;
      run(instance: WebAssembly.Instance): Promise<void>;
    };
    onTailcatReady?: () => void;
  }
}
let boot: Promise<void> | undefined;
export function loadTailcat(progress: (s: string) => void) {
  if (boot) return boot;
  boot = (async () => {
    progress("Loading encryption engine (about 8 MB)");
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "/tailcat/wasm_exec.js";
      s.onload = () => resolve();
      s.onerror = () =>
        reject(new Error("Failed to load the encryption runtime script."));
      document.head.append(s);
    });
    const ready = new Promise<void>((resolve) => {
      window.onTailcatReady = resolve;
    });
    const go = new window.Go();
    const resp = await fetch("/tailcat/main.wasm.gz", { cache: "default" });
    if (!resp.ok || !resp.body) throw new Error("WASM download failed.");
    // Some static hosts set Content-Encoding on .gz files, so detect gzip bytes before decompressing.
    let wasm = await resp.arrayBuffer();
    const first = new Uint8Array(wasm, 0, Math.min(wasm.byteLength, 2));
    if (first[0] === 31 && first[1] === 139)
      wasm = await new Response(
        new Blob([wasm]).stream().pipeThrough(new DecompressionStream("gzip")),
      ).arrayBuffer();
    const { instance } = await WebAssembly.instantiate(wasm, go.importObject);
    void go.run(instance);
    await ready;
  })().catch((err) => {
    boot = undefined;
    throw err;
  });
  return boot;
}

/** Runs the shared connection setup used by both page entry points. */
export async function connectTunnel(
  tunnel: Tunnel,
  address: string,
  progress: (key: string) => void,
) {
  await loadTailcat((text) => progress(connectionProgressKey(text)));
  progress("connectingDevice");
  await tunnel.connect(address);
  await tunnel.tryDirect((text) => progress(connectionProgressKey(text)));
  progress("preparingApp");
  await activateBridge(tunnel);
}
export function encode(bytes: Uint8Array) {
  let text = "";
  for (let off = 0; off < bytes.length; off += 32768)
    text += String.fromCharCode(...bytes.subarray(off, off + 32768));
  return btoa(text);
}
export function decode(body?: string) {
  return Uint8Array.from(atob(body || ""), (c) => c.charCodeAt(0));
}
export class Tunnel {
  private cache?: HTTPCache;
  private conn?: Conn;
  private relayConn?: Conn;
  private streaming = false;
  private chunked = false;
  private socketChunks = false;
  transport: "relay" | "direct" = "relay";
  hostname = "";
  onTransport?: () => void;
  private next = 1;
  private queue = Promise.resolve();
  private pending = new Map<
    number,
    {
      resolve: (f: Frame) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private listeners = new Map<number, (f: Frame) => void>();
  onClose?: () => void;
  onStats?: (stats: { sent: number; received: number }) => void;
  stats = { sent: 0, received: 0 };
  async connect(addr: string) {
    this.conn = await window.tailcatDial({
      addr,
      derpMapURL: "https://tailcat.dev/derpmap.json",
      port: 8447,
    });
    this.relayConn = this.conn;
    void this.readLoop(this.conn);
    const hello = await this.request({ op: "ping" });
    this.hostname = hello.hostname || "";
    this.streaming = !!hello.capabilities?.includes("http-stream-v1");
    this.chunked = !!hello.capabilities?.includes("http-chunks-v1");
    this.socketChunks = !!hello.capabilities?.includes("ws-chunks-v1");
    this.cache = hello.capabilities?.includes("http-cache-v1")
      ? await deviceCache(addr)
      : undefined;
  }
  async tryDirect(progress: (text: string) => void) {
    progress("Checking for a local direct connection (up to 12 seconds)");
    try {
      const direct = await localDirect(async (sdp) => {
        const result = await this.request({ op: "direct-offer", sdp }, 11000);
        if (!result.sdp)
          throw new Error(
            "Connector does not support direct connections; update the connector.",
          );
        return result.sdp;
      });
      if (!this.conn) {
        direct.close();
        throw new Error("Connection closed.");
      }
      this.conn = direct;
      void this.readLoop(direct);
      try {
        await this.request({ op: "ping" }, 3000);
      } catch (error) {
        if (this.conn === direct) this.conn = this.relayConn;
        direct.close();
        throw error;
      }
      this.transport = "direct";
      this.onTransport?.();
      progress(
        "Local direct connection established; application data does not use the public DERP relay",
      );
    } catch {
      this.transport = "relay";
      this.onTransport?.();
      progress(
        "Could not establish a direct connection; continuing through the public DERP relay (check the firewall, Wi-Fi isolation, or connector version)",
      );
    }
  }
  send(frame: Frame, conn = this.conn) {
    if (!conn) return Promise.reject(new Error("Connection closed."));
    const bytes = new TextEncoder().encode(JSON.stringify(frame) + "\n");
    const result = this.queue.then(() => conn.write(bytes));
    this.queue = result.catch(() => {});
    return result.then(() => {
      this.stats.sent += bytes.length;
      this.onStats?.({ ...this.stats });
    });
  }
  private request(frame: Omit<Frame, "id">, timeoutMs = 90000): Promise<Frame> {
    const id = this.next++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Connector response timed out."));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ ...frame, id }).catch((e) => {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(e);
      });
    });
  }
  async http(
    path: string,
    method = "GET",
    headers: Record<string, string> = {},
    body = "",
    cacheMode: RequestCache = "default",
    signal?: AbortSignal,
  ) {
    const origin = (
      path: string,
      method: string,
      headers: Record<string, string>,
      body: string,
    ) => this.originHTTP(path, method, headers, body, signal);
    return this.cache
      ? this.cache.request(path, method, headers, body, cacheMode, origin)
      : origin(path, method, headers, body);
  }
  private async originHTTP(
    path: string,
    method: string,
    headers: Record<string, string>,
    body: string,
    signal?: AbortSignal,
  ) {
    if (signal?.aborted) throw new Error("Request canceled.");
    if (this.streaming) {
      const id = this.next++;
      const conn = this.conn;
      const result = receiveHTTP(
        id,
        (frame) => this.send(frame, conn),
        (listener) => this.listeners.set(id, listener),
        () => this.listeners.delete(id),
        decode,
        90000,
        signal,
      );
      void this.send(
        { id, op: "http", path, method, headers, body, stream: true, chunked: this.chunked },
        conn,
      ).catch((error) =>
        this.listeners.get(id)?.({
          id,
          op: "http-error",
          error: error.message,
        }),
      );
      return result;
    }
    if (
      Object.entries(headers).some(
        ([key, value]) =>
          key.toLowerCase() === "accept" && value.includes("text/event-stream"),
      )
    )
      throw new Error("SSE requires a newer local connector.");
    const f = await this.request({ op: "http", path, method, headers, body });
    if (f.error) throw new Error(f.error);
    if (f.encoding === "gzip") {
      const expanded = await new Response(
        new Blob([decode(f.body)])
          .stream()
          .pipeThrough(new DecompressionStream("gzip")),
      ).arrayBuffer();
      if (expanded.byteLength > 32 * 1024 * 1024)
        throw new Error("Decompressed response exceeds the safety limit.");
      f.body = encode(new Uint8Array(expanded));
    }
    return {
      status: f.status || 502,
      headers: f.headers || {},
      body: f.body || "",
    };
  }
  async ping() {
    const start = performance.now();
    await this.request({ op: "ping" });
    return Math.round(performance.now() - start);
  }
  async probe() {
    const start = performance.now();
    const f = await this.request({ op: "probe", size: 262144 });
    if (f.error) throw new Error(f.error);
    const body = decode(f.body);
    if (body.length !== 262144 || body.some((b, i) => b !== i % 251))
      throw new Error("Bandwidth probe data integrity check failed.");
    const seconds = (performance.now() - start) / 1000;
    return {
      mbps: Number(((body.length * 8) / seconds / 1e6).toFixed(2)),
      seconds: Number(seconds.toFixed(2)),
    };
  }
  openSocket(
    path: string,
    listener: (f: Frame) => void,
    protocols: string[] = [],
  ) {
    const id = this.next++;
    this.listeners.set(id, listener);
    void this.send({ id, op: "ws-open", path, protocols, chunked: this.socketChunks }).catch(() =>
      listener({ id, op: "ws-error", error: "Tunnel closed." }),
    );
    return id;
  }
  socketSend(id: number, body: string, type: number) {
    return this.send({ id, op: "ws-send", body, type });
  }
  socketClose(id: number) {
    this.listeners.delete(id);
    void this.send({ id, op: "ws-close" }).catch(() => {});
  }
  private async readLoop(conn: Conn) {
    let buffer = "";
    const decoder = new TextDecoder();
    try {
      for (let chunk; (chunk = await conn.read()) !== null; ) {
        this.stats.received += chunk.length;
        this.onStats?.({ ...this.stats });
        buffer += decoder.decode(chunk, { stream: true });
        if (buffer.length > 46 * 1024 * 1024)
          throw new Error("Response exceeds the safety limit.");
        let end;
        while ((end = buffer.indexOf("\n")) !== -1) {
          const f: Frame = JSON.parse(buffer.slice(0, end));
          buffer = buffer.slice(end + 1);
          const pending = this.pending.get(f.id);
          if (pending) {
            clearTimeout(pending.timer);
            this.pending.delete(f.id);
            f.error ? pending.reject(new Error(f.error)) : pending.resolve(f);
          } else {
            this.listeners.get(f.id)?.(f);
            if (f.op === "ws-closed" || f.op === "ws-error")
              this.listeners.delete(f.id);
          }
        }
      }
    } catch {
      /* close notifies all waiting requests */
    }
    if (this.conn !== conn) {
      if (this.relayConn === conn) this.relayConn = undefined;
      return;
    }
    if (
      this.transport === "direct" &&
      this.relayConn &&
      this.relayConn !== conn
    ) {
      this.conn = this.relayConn;
      this.transport = "relay";
      conn.close();
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(
          new Error(
            "Direct connection interrupted; relay restored. Retry; write requests are not replayed.",
          ),
        );
      }
      this.pending.clear();
      for (const [id, l] of this.listeners)
        l({ id, op: "ws-error", error: "Direct connection interrupted." });
      this.listeners.clear();
      this.onTransport?.();
      return;
    }
    this.close();
  }
  close() {
    if (!this.conn) return;
    const conn = this.conn;
    this.conn = undefined;
    conn.close();
    this.relayConn?.close();
    this.relayConn = undefined;
    if (window.tailcatRelay === this) delete window.tailcatRelay;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error("Tunnel closed."));
    }
    this.pending.clear();
    for (const [id, l] of this.listeners) {
      l({ id, op: "ws-error", error: "Tunnel closed." });
    }
    this.listeners.clear();
    this.onClose?.();
  }
}
