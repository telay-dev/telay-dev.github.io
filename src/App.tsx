import { useEffect, useRef, useState } from "preact/hooks";
import { ArrowRight, Loader2, MoreHorizontal } from "lucide-preact";
import { Tunnel, connectTunnel } from "./tunnel";
import { openApplication } from "./open-application";
import { connectionError, errorCopy } from "./connection-copy";
import type { ConnectionError } from "./connection-copy";
import QuickInstall from "./QuickInstall";
import RelayHelp from "./RelayHelp";
import { t as tr, useLanguage } from "./i18n";
import LanguageSelect from "./LanguageSelect";
import RecentAddresses from "./RecentAddresses";
import "./history";

const bytes = (n: number) =>
  n < 1024 ? n + " B" : (n / 1048576).toFixed(2) + " MB";

export default function App() {
  useLanguage();
  const [addr, setAddr] = useState(
    () => window.relayHistory.entries[0]?.address || "",
  );
  const [phase, setPhase] = useState<"idle" | "connecting" | "connected">(
    "idle",
  );
  const [status, setStatus] = useState("disconnected");
  const [error, setError] = useState<ConnectionError>();
  const [route, setRoute] = useState<"relay" | "direct">("relay");
  const [opening, setOpening] = useState(false);
  const [rtt, setRtt] = useState<number>();
  const [speed, setSpeed] = useState<number>();
  const [measuring, setMeasuring] = useState(false);
  const [stats, setStats] = useState({ sent: 0, received: 0 });
  const tunnel = useRef<Tunnel | undefined>(undefined);
  const connecting = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(location.hash.slice(1));
    if (params.has("pair")) {
      setAddr(params.get("pair") || "");
      history.replaceState(null, "", location.pathname + location.search);
    }
    return () => {
      tunnel.current?.close();
    };
  }, []);

  async function connect() {
    if (connecting.current || phase !== "idle") return;
    const value = addr.trim();
    if (!/^tc[A-Za-z0-9_-]{20,}$/.test(value)) {
      setError(errorCopy("pairIncomplete", "pairIncompleteRecovery", true));
      document.querySelector<HTMLInputElement>("#pair")?.focus();
      return;
    }
    connecting.current = true;
    setPhase("connecting");
    setError(undefined);
    setRtt(undefined);
    setSpeed(undefined);
    setStats({ sent: 0, received: 0 });
    const t = new Tunnel();
    tunnel.current = t;
    t.onStats = setStats;
    t.onTransport = () => setRoute(t.transport);
    t.onClose = () => {
      if (tunnel.current !== t) return;
      setPhase("idle");
      setStatus("disconnectedRetry");
    };
    try {
      await connectTunnel(t, value, setStatus);
      window.relayHistory.save(value, t.hostname);
      setRtt(await t.ping());
      setRoute(t.transport);
      setPhase("connected");
      void measure(t, true);
    } catch (err) {
      t.close();
      setPhase("idle");
      setStatus("disconnected");
      setError(connectionError(err));
    } finally {
      connecting.current = false;
    }
  }

  async function openNative() {
    if (opening) return;
    setError(undefined);
    setOpening(true);
    try {
      const t = tunnel.current;
      if (!t) throw new Error("Connection closed.");
      await openApplication(t, "/", addr.trim());
    } catch (err) {
      setError(connectionError(err));
    } finally {
      setOpening(false);
    }
  }

  function openTab() {
    // The new page pairs independently; transfer the connection only after a click.
    window.open(
      "/__relay/index.html#pair=" + encodeURIComponent(addr.trim()),
      "_blank",
      "noopener,noreferrer",
    );
    tunnel.current?.close();
    setStatus("newTabHint");
  }

  async function measure(t = tunnel.current, automatic = false) {
    if (!t) return;
    setMeasuring(true);
    if (!automatic) setError(undefined);
    try {
      const values = [];
      for (let i = 0; i < 3; i++) values.push(await t.ping());
      values.sort((a, b) => a - b);
      const result = await t.probe();
      if (tunnel.current === t) {
        setRtt(values[1]);
        setSpeed(result.mbps);
      }
    } catch (err) {
      if (!automatic && tunnel.current === t) setError(connectionError(err));
    } finally {
      if (tunnel.current === t) setMeasuring(false);
    }
  }

  return (
    <div className="relay-shell">
      <header className="flex items-center justify-between gap-4 px-6 py-7 sm:px-10">
        <a
          href="/"
          className="text-lg font-medium tracking-tight"
          aria-label={tr("home")}
        >
          <span className="font-bold text-accent">T</span>elay
        </a>
        <div className="flex items-center gap-2">
          <a
            className="quiet-button"
            href="https://github.com/telay-dev/telay-dev.github.io"
            aria-label="GitHub"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="currentColor"
            >
              <path d="M12 .75a11.25 11.25 0 0 0-3.56 21.92c.56.1.77-.24.77-.54v-1.88c-3.13.68-3.79-1.33-3.79-1.33-.51-1.3-1.25-1.64-1.25-1.64-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 1.71 2.62 1.22 3.26.93.1-.73.39-1.22.71-1.5-2.5-.29-5.14-1.26-5.14-5.57 0-1.23.44-2.24 1.16-3.03-.12-.28-.5-1.43.11-2.99 0 0 .95-.3 3.09 1.16a10.7 10.7 0 0 1 5.62 0c2.14-1.46 3.09-1.16 3.09-1.16.61 1.56.23 2.71.11 2.99.73.79 1.16 1.8 1.16 3.03 0 4.32-2.64 5.28-5.16 5.56.41.35.77 1.04.77 2.1v2.86c0 .3.2.65.78.54A11.25 11.25 0 0 0 12 .75Z" />
            </svg>
          </a>
          <LanguageSelect />
        </div>
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 px-6 pb-12 pt-10 sm:pt-20">
        <h1 className="hero-heading mb-10">
          <span>{tr("headingLead")}</span>{" "}
          <span className="hero-heading-accent">{tr("headingEmphasis")}</span>
        </h1>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void (phase === "connected" ? openNative() : connect());
          }}
        >
          <label htmlFor="pair" className="mb-3 block text-sm font-medium">
            {tr("pairLabel")}
          </label>
          <input
            id="pair"
            className="field w-full font-mono"
            type="password"
            autoComplete="off"
            spellcheck={false}
            value={addr}
            disabled={phase !== "idle"}
            placeholder={tr("pairPlaceholder")}
            aria-describedby={
              error?.field ? "pair-hint connection-error" : "pair-hint"
            }
            aria-invalid={error?.field || undefined}
            onChange={(event) => {
              setAddr(event.currentTarget.value);
              setError(undefined);
            }}
          />
          <p id="pair-hint" className="mt-3 text-xs leading-5 text-muted">
            {tr("pairHint")}
          </p>
          <RecentAddresses
            address={addr}
            disabled={phase !== "idle"}
            onSelect={(value) => {
              setAddr(value);
              setError(undefined);
            }}
          />
          <button
            id={phase === "connected" ? "open-native" : "connect"}
            type="submit"
            className="btn mt-7 w-full"
            data-state={
              phase === "connecting" || opening
                ? "busy"
                : phase === "connected"
                  ? "ready"
                  : "idle"
            }
            aria-busy={phase === "connecting" || opening}
            disabled={phase === "connecting" || opening}
          >
            {phase === "connecting" || opening ? (
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            ) : null}
            {tr(
              opening
                ? "opening"
                : phase === "connected"
                  ? "open"
                  : phase === "connecting"
                    ? "connecting"
                    : "connect",
            )}
            {phase === "connected" && !opening ? (
              <ArrowRight
                size={16}
                className="button-icon"
                aria-hidden="true"
              />
            ) : null}
          </button>
        </form>
        <div className="mt-4 flex min-h-11 items-center justify-between gap-3">
          <p role="status" className="text-xs leading-5 text-muted">
            {phase === "connected"
              ? tr(route === "direct" ? "connectedDirect" : "connectedRelay")
              : tr(status)}
            {phase === "connected" && (measuring || speed !== undefined)
              ? ` · ${measuring ? tr("measuring") : `${tr("downloadSpeed")} ${speed} Mbps`}`
              : null}
          </p>
          {phase === "connected" && (
            <details className="action-menu relative shrink-0">
              <summary
                className="quiet-button"
                aria-label={tr("connectionOptions")}
              >
                <MoreHorizontal size={18} aria-hidden="true" />
              </summary>
              <div className="menu-panel">
                <button
                  id="open-tab"
                  type="button"
                  className="menu-item"
                  disabled={opening}
                  onClick={openTab}
                >
                  {tr("newTab")}
                </button>
                <details className="px-2">
                  <summary className="py-3 text-xs">
                    {tr("diagnostics")}
                  </summary>
                  <dl className="space-y-3 pb-4 text-xs text-muted">
                    <div className="flex justify-between gap-4">
                      <dt>{tr("latency")}</dt>
                      <dd className="tabular-nums">{rtt ?? "—"} ms</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt>{tr("downloadSpeed")}</dt>
                      <dd className="tabular-nums">{speed ?? "—"} Mbps</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt>{tr("traffic")}</dt>
                      <dd className="tabular-nums">
                        {bytes(stats.sent)} / {bytes(stats.received)}
                      </dd>
                    </div>
                  </dl>
                  <button
                    id="measure"
                    type="button"
                    className="quiet-button mb-2"
                    onClick={() => void measure()}
                    disabled={measuring || opening}
                  >
                    {tr(measuring ? "measuring" : "measure")}
                  </button>
                  <p className="pb-3 text-xs leading-5 text-muted">
                    {tr("measureHint")}
                  </p>
                </details>
                <button
                  id="disconnect"
                  type="button"
                  className="menu-item"
                  disabled={opening}
                  onClick={() => tunnel.current?.close()}
                >
                  {tr("disconnect")}
                </button>
              </div>
            </details>
          )}
        </div>
        {error && (
          <p
            id="connection-error"
            role="alert"
            className="mt-2 text-sm leading-6 text-danger"
          >
            {error.message} {error.recovery}
          </p>
        )}
        <div className="mt-9 border-t border-line pt-3">
          <details className="disclosure" id="setup">
            <summary>{tr("install")}</summary>
            <QuickInstall />
          </details>
          <details className="disclosure">
            <summary>{tr("help")}</summary>
            <RelayHelp />
          </details>
        </div>
      </main>
    </div>
  );
}
