self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("message", (event) => {
  if (event.data?.op === "claim") event.waitUntil(self.clients.claim());
});
function encode(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 32768)
    s += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(s);
}
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Proxy same-origin requests for standalone apps without host-page coordination or persistent Service Worker state.
  if (url.origin !== self.location.origin) return;
  if (
    url.pathname === "/bridge-sw.js" ||
    url.pathname.startsWith("/tailcat/") ||
    (url.pathname.startsWith("/__relay/") &&
      !url.pathname.startsWith("/__relay/view/"))
  )
    return;
  if (
    event.request.mode === "navigate" &&
    url.pathname.startsWith("/__relay/view/")
  ) {
    event.respondWith(fetch("/__relay/index.html"));
    return;
  }
  event.respondWith(
    (async () => {
      try {
        const target = await self.clients.get(event.clientId);
        if (!target) return fetch(event.request);
        const active = await new Promise((resolve) => {
          const probe = new MessageChannel();
          const timer = setTimeout(() => {
            probe.port1.close();
            resolve(false);
          }, 500);
          probe.port1.onmessage = (e) => {
            clearTimeout(timer);
            probe.port1.close();
            resolve(!!e.data.active);
          };
          target.postMessage({ op: "relay-identify" }, [probe.port2]);
        });
        if (!active) return fetch(event.request);
        if (event.request.mode === "navigate")
          return fetch("/__relay/index.html");
        const body = ["GET", "HEAD"].includes(event.request.method)
          ? ""
          : encode(new Uint8Array(await event.request.arrayBuffer()));
        const headers = Object.fromEntries(event.request.headers);
        const path =
          (url.pathname.startsWith("/__relay/view/")
            ? url.pathname.slice("/__relay/view".length)
            : url.pathname) + url.search;
        return await self.relayHTTPResponse(event, target, {
          op: "relay-http",
          path,
          method: event.request.method,
          headers,
          body,
          cache: event.request.cache,
        });
      } catch (err) {
        return new Response("Telay: " + err.message, {
          status: 502,
          headers: { "Content-Type": "text/plain;charset=utf-8" },
        });
      }
    })(),
  );
});
self.importScripts("/__relay/http-response.js");
