import CachePolicy from "http-cache-semantics";

export type HTTPResult = {
  status: number;
  headers: Record<string, string>;
  body: string;
  stream?: ReadableStream<Uint8Array>;
};
type OriginRequest = (
  path: string,
  method: string,
  headers: Record<string, string>,
  body: string,
) => Promise<HTTPResult>;
type Saved = { response: HTTPResult; policy: CachePolicy.CachePolicyObject };
const prefix = "relay-http-v1-";
const options = { shared: false, cacheHeuristic: 0, immutableMinTimeToLive: 0 };
export const forwardedHeaders = [
  "content-type",
  "accept",
  "accept-language",
  "range",
  "x-csrf-token",
  "x-xsrf-token",
  "cache-control",
  "pragma",
  "if-none-match",
  "if-modified-since",
  "if-match",
  "if-unmodified-since",
  "if-range",
  "last-event-id",
];
const lower = (headers: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
const strings = (headers: CachePolicy.Headers) =>
  Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key, String(value)]),
  );
const cacheable = (response: HTTPResult) => {
  const h = lower(response.headers);
  const vary = (h.vary || "")
    .toLowerCase()
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  // Bypass cache when unforwarded headers (such as upstream cookies) may change the representation.
  return (
    !response.stream &&
    !h["content-type"]?.toLowerCase().includes("text/event-stream") &&
    response.status === 200 &&
    response.body.length <= 12 * 1024 * 1024 &&
    vary.every((name) => forwardedHeaders.includes(name)) &&
    !!(h["cache-control"] || h.expires || h.etag || h["last-modified"])
  );
};
const corrected = (response: HTTPResult, started: number) => {
  const headers = lower(response.headers);
  const received = Date.now();
  const date = Date.parse(headers.date || "");
  const age = Math.max(0, Number(headers.age) || 0);
  // Account for RFC 9111 apparent_age so an old Date cannot extend freshness.
  headers.age = String(
    Math.ceil(
      Math.max(
        Number.isFinite(date) ? Math.max(0, (received - date) / 1000) : 0,
        age + Math.max(0, (received - started) / 1000),
      ),
    ),
  );
  return { status: response.status, headers };
};
export class HTTPCache {
  private generation = 0;
  constructor(
    private name: string,
    private origin: string,
  ) {}
  async clear() {
    this.generation++;
    try {
      await caches.delete(prefix + this.name);
    } catch {
      /* Network requests work without CacheStorage. */
    }
  }
  async request(
    path: string,
    method: string,
    headers: Record<string, string>,
    body: string,
    mode: RequestCache,
    upstream: OriginRequest,
  ): Promise<HTTPResult> {
    const requestHeaders = lower(headers);
    const restrict = (directive: string) => {
      requestHeaders["cache-control"] = [
        requestHeaders["cache-control"],
        directive,
      ]
        .filter(Boolean)
        .join(", ");
    };
    if (mode === "no-store") restrict("no-store");
    if (mode === "no-cache" || mode === "reload") restrict("no-cache");
    if (
      method !== "GET" ||
      requestHeaders.range ||
      Object.keys(requestHeaders).some((key) => key.startsWith("if-"))
    ) {
      if (mode === "only-if-cached")
        return { status: 504, headers: {}, body: "" };
      if (!["GET", "HEAD", "OPTIONS"].includes(method)) await this.clear();
      const result = await upstream(path, method, requestHeaders, body);
      if (!["GET", "HEAD", "OPTIONS"].includes(method)) await this.clear();
      return result;
    }
    const generation = this.generation;
    // CacheStorage.put replaces the same URL, so distinguish representations to preserve Vary variants.
    const representationHeaders = Object.entries(requestHeaders)
      .filter(([key]) => !["cache-control", "pragma"].includes(key))
      .sort(([a], [b]) => a.localeCompare(b));
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify(representationHeaders)),
    );
    const keyURL = new URL("/__relay/cache-entry" + path, this.origin);
    keyURL.searchParams.append(
      "__relay_variant",
      Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join(""),
    );
    const cacheKey = new Request(keyURL, { headers: requestHeaders });
    const request = { url: path, method, headers: requestHeaders };
    let cache: Cache | undefined;
    let saved: Saved | undefined;
    let policy: CachePolicy | undefined;
    const noStore = /(?:^|,)\s*no-store\s*(?:,|$)/i.test(
      requestHeaders["cache-control"] || "",
    );
    if (!noStore) {
      try {
        cache = await caches.open(prefix + this.name);
        if (mode !== "reload") {
          const hit = await cache.match(cacheKey);
          if (hit) {
            saved = await hit.json();
            policy = CachePolicy.fromObject(saved!.policy);
          }
        }
      } catch {
        cache = undefined;
        saved = undefined;
        policy = undefined;
      }
    }
    if (saved && policy?.satisfiesWithoutRevalidation(request))
      return { ...saved.response, headers: strings(policy.responseHeaders()) };
    if (mode === "only-if-cached")
      return {
        status: 504,
        headers: { "content-type": "text/plain" },
        body: "",
      };
    const networkHeaders = policy
      ? strings(policy.revalidationHeaders(request))
      : requestHeaders;
    const started = Date.now();
    let result = await upstream(path, method, networkHeaders, body);
    if (result.stream) {
      try {
        await cache?.delete(cacheKey);
      } catch {
        /* Streaming responses are not cached. */
      }
      return result;
    }
    const response = corrected(result, started);
    let next = new CachePolicy(request, response, options);
    if (saved && policy) {
      const updated = policy.revalidatedPolicy(
        { ...request, headers: networkHeaders },
        response,
      );
      next = updated.policy;
      if (
        result.status === 304 &&
        "matches" in updated &&
        updated.matches === false
      ) {
        const retryStarted = Date.now();
        result = await upstream(path, method, requestHeaders, body);
        next = new CachePolicy(
          request,
          corrected(result, retryStarted),
          options,
        );
      } else if (!updated.modified)
        result = {
          ...saved.response,
          headers: strings(next.responseHeaders()),
        };
    }
    if (cache && this.generation === generation) {
      try {
        if (cacheable(result) && next.storable()) {
          await cache.put(
            cacheKey,
            new Response(
              JSON.stringify({ response: result, policy: next.toObject() }),
              {
                headers: {
                  "content-type": "application/json",
                  vary: lower(result.headers).vary || "",
                },
              },
            ),
          );
          const keys = await cache.keys();
          for (const key of keys.slice(0, Math.max(0, keys.length - 24)))
            await cache.delete(key);
        } else await cache.delete(cacheKey);
      } catch {
        /* Use the network response when storage is unavailable. */
      }
    }
    return result;
  }
}
export async function deviceCache(address: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(address),
  );
  return new HTTPCache(
    Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join(""),
    location.origin,
  );
}
window.addEventListener("relay-history-cleared", () => {
  void (async () => {
    try {
      for (const name of await caches.keys())
        if (name.startsWith(prefix)) await caches.delete(name);
    } catch {}
  })();
});
