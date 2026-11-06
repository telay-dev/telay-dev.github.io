import type { HTTPResult } from "./http-cache";

// The page handles the encrypted connection; the service worker pulls data through a MessagePort.
export async function serveHTTPPort(
  port: MessagePort,
  request: (signal: AbortSignal) => Promise<HTTPResult>,
) {
  const abort = new AbortController();
  let cancelled = false;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let pulling = false;
  let finished = false;
  const close = () => {
    finished = true;
    port.onmessage = null;
    port.close();
  };
  port.onmessage = (event) => {
    if (event.data?.op === "http-cancel") {
      cancelled = true;
      abort.abort();
      void reader?.cancel().catch(() => {});
      close();
    } else if (
      event.data?.op === "http-pull" &&
      reader &&
      !pulling &&
      !cancelled
    ) {
      pulling = true;
      void reader
        .read()
        .then(({ value, done }) => {
          pulling = false;
          if (cancelled || finished) return;
          if (done) {
            port.postMessage({ op: "http-end" });
            close();
          } else
            port.postMessage({ op: "http-data", body: value.buffer }, [
              value.buffer,
            ]);
        })
        .catch((error) => {
          if (!cancelled && !finished) {
            port.postMessage({ op: "http-error", error: error.message });
            close();
          }
        });
    }
  };
  try {
    const result = await request(abort.signal);
    if (cancelled) {
      await result.stream?.cancel();
      return;
    }
    if (result.stream) {
      reader = result.stream.getReader();
      port.postMessage({
        status: result.status,
        headers: result.headers,
        stream: true,
      });
      // Notify the service worker on disconnect even while the consumer is paused.
      void reader.closed.catch((error) => {
        if (!cancelled && !finished) {
          port.postMessage({ op: "http-error", error: error.message });
          close();
        }
      });
    } else {
      port.postMessage(result);
      close();
    }
  } catch (error) {
    if (!cancelled) {
      port.postMessage({
        error: error instanceof Error ? error.message : "Connection failed",
      });
      close();
    }
  }
}
