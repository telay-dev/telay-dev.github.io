import type { Tunnel } from "./tunnel";
import { decode } from "./tunnel";
import { appPath } from "./paths";
import "./history";

export const viewPrefix = appPath("__relay/view");

export async function openApplication(
  tunnel: Tunnel,
  path = "/",
  pairAddress?: string,
) {
  const data = await tunnel.http(path);
  if (data.status !== 200)
    throw new Error(
      `Upstream returned HTTP ${data.status}; check the local service and authentication.`,
    );
  if (
    !Object.entries(data.headers).some(
      ([key, value]) =>
        key.toLowerCase() === "content-type" &&
        value.toLowerCase().includes("text/html"),
    )
  )
    throw new Error(
      "The standalone entry requires an HTML response; the relay still supports other HTTP resources.",
    );

  const documentCopy = new DOMParser().parseFromString(
    new TextDecoder().decode(decode(data.body)),
    "text/html",
  );
  if (pairAddress) window.relayHistory.save(pairAddress, documentCopy.title);
  documentCopy.querySelectorAll("base").forEach((element) => element.remove());

  const base = documentCopy.createElement("base");
  base.href = viewPrefix + "/";
  const runtime = documentCopy.createElement("script");
  runtime.src = appPath("__relay/runtime.js");
  const referrer = documentCopy.createElement("meta");
  referrer.name = "referrer";
  referrer.content = "no-referrer";
  documentCopy.head.prepend(base, referrer, runtime);

  tunnel.onStats = undefined;
  tunnel.onClose = undefined;
  tunnel.onTransport = undefined;
  window.tailcatRelay = tunnel;
  window.relayApplication = true;
  window.relayPairAddress = pairAddress;
  history.replaceState(null, "", viewPrefix + path);
  document.open();
  document.write("<!doctype html>" + documentCopy.documentElement.outerHTML);
  document.close();
}
