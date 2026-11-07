import type { HTTPResult } from "./http-cache";

export type HTTPFrame = {
  id: number;
  op: string;
  status?: number;
  headers?: Record<string, string>;
  body?: string;
  error?: string;
  encoding?: string;
};

// Use one 32 KiB chunk as credit so upstream reads pause with the consumer.
export function receiveHTTP(
  id: number,
  send: (frame: HTTPFrame) => Promise<void>,
  listen: (listener: (frame: HTTPFrame) => void) => void,
  unlisten: () => void,
  decode: (body?: string) => Uint8Array,
  timeoutMs = 90000,
  signal?: AbortSignal,
): Promise<HTTPResult> {
  return new Promise((resolve, reject) => {
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
    let finishPull: (() => void) | undefined;
    let finished = false;
    let resultHead: HTTPFrame | undefined;
    const parts: string[] = [];
    const cleanup = () => {
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      unlisten();
      finishPull?.();
      finishPull = undefined;
    };
    const cancel = () => {
      void send({ id, op: "http-cancel" }).catch(() => {});
    };
    const fail = (message: string) => {
      if (finished) return;
      cleanup();
      const error = new Error(message);
      if (controller) controller.error(error);
      else reject(error);
    };
    const abort = () => {
      cancel();
      fail("Request canceled.");
    };
    const timeout = () => {
      cancel();
      fail("Connector response timed out.");
    };
    let timer = setTimeout(timeout, timeoutMs);
    const progress = () => {
      clearTimeout(timer);
      timer = setTimeout(timeout, timeoutMs);
    };
    listen((frame) => {
      if (finished) return;
      if (frame.error || frame.op === "ws-error" || frame.op === "ws-closed") {
        fail(frame.error || "Tunnel closed.");
        return;
      }
      if (frame.op === "result-head") {
        progress();
        resultHead = frame;
        return;
      }
      if (frame.op === "result-part") {
        progress();
        parts.push(frame.body || "");
        return;
      }
      if (frame.op === "result-end" && resultHead) {
        frame = { ...resultHead, op: "result", body: parts.join("") };
      }
      if (frame.op === "result") {
        cleanup();
        void (async () => {
          let body = frame.body || "";
          if (frame.encoding === "gzip") {
            const expanded = await new Response(
              new Blob([new Uint8Array(decode(body))])
                .stream()
                .pipeThrough(new DecompressionStream("gzip")),
            ).arrayBuffer();
            if (expanded.byteLength > 32 * 1024 * 1024)
              throw new Error(
                "Decompressed response exceeds the safety limit.",
              );
            const bytes = new Uint8Array(expanded);
            let text = "";
            for (let off = 0; off < bytes.length; off += 32768)
              text += String.fromCharCode(...bytes.subarray(off, off + 32768));
            body = btoa(text);
          }
          resolve({
            status: frame.status || 502,
            headers: frame.headers || {},
            body,
          });
        })().catch(reject);
      } else if (frame.op === "http-head") {
        clearTimeout(timer);
        const stream = new ReadableStream<Uint8Array>(
          {
            start(value) {
              controller = value;
            },
            pull() {
              if (finished) return;
              return new Promise<void>((done) => {
                finishPull = done;
                void send({ id, op: "http-pull" }).catch((error) =>
                  fail(error.message),
                );
              });
            },
            cancel() {
              if (!finished) {
                cleanup();
                cancel();
              }
            },
          },
          { highWaterMark: 0 },
        );
        resolve({
          status: frame.status || 502,
          headers: frame.headers || {},
          body: "",
          stream,
        });
      } else if (frame.op === "http-data") {
        const bytes = decode(frame.body);
        if (!controller || !finishPull || bytes.byteLength > 32768) {
          cancel();
          fail("Invalid streaming response protocol.");
          return;
        }
        controller.enqueue(bytes);
        finishPull();
        finishPull = undefined;
      } else if (frame.op === "http-end") {
        cleanup();
        controller?.close();
      }
    });
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}
