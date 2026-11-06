import { serveHTTPPort } from "./http-port";
import type { Tunnel } from "./tunnel";

declare global {
  interface Window {
    relayPairAddress?: string;
    relayApplication?: boolean;
    tailcatRelay?: Tunnel;
  }
}

export async function activateBridge(tunnel: Tunnel) {
  window.tailcatRelay = tunnel;
  if (!("serviceWorker" in navigator))
    throw new Error(
      "This browser does not support Service Workers; use a current version of Chrome or Safari.",
    );
  const scriptURL = new URL("/bridge-sw.js", location.origin).href;
  const registration = await navigator.serviceWorker.register(scriptURL, {
    scope: "/",
    updateViaCache: "none",
  });
  const worker =
    registration.installing || registration.waiting || registration.active;
  if (worker && worker.state !== "activated")
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        worker.removeEventListener("statechange", changed);
      };
      const changed = () => {
        if (worker.state === "activated") {
          cleanup();
          resolve();
        } else if (worker.state === "redundant") {
          cleanup();
          reject(new Error("Page bridge failed to initialize."));
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            "Page bridge initialization timed out; reload and try again.",
          ),
        );
      }, 10000);
      worker.addEventListener("statechange", changed);
      changed();
    });
  await navigator.serviceWorker.ready;
  if (navigator.serviceWorker.controller?.scriptURL !== scriptURL)
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        navigator.serviceWorker.removeEventListener(
          "controllerchange",
          changed,
        );
      };
      const changed = () => {
        if (navigator.serviceWorker.controller?.scriptURL === scriptURL) {
          cleanup();
          resolve();
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            "Page bridge initialization timed out; reload and try again.",
          ),
        );
      }, 10000);
      navigator.serviceWorker.addEventListener("controllerchange", changed);
      registration.active?.postMessage({ op: "claim" });
      changed();
    });
}

export function bindRelayHTTP() {
  navigator.serviceWorker?.addEventListener("message", async (event) => {
    if (event.data?.op === "relay-identify") {
      event.ports[0]?.postMessage({ active: !!window.relayApplication });
      return;
    }
    if (event.data?.op !== "relay-http" || !event.ports[0]) return;
    await serveHTTPPort(event.ports[0], (signal) => {
      if (!window.tailcatRelay) throw new Error("Not connected.");
      return window.tailcatRelay.http(
        event.data.path,
        event.data.method,
        event.data.headers,
        event.data.body,
        event.data.cache,
        signal,
      );
    });
  });
}

bindRelayHTTP();
