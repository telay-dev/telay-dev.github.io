import { t } from "./i18n";

export type ConnectionError = {
  message: string;
  recovery: string;
  field?: boolean;
};

export function errorCopy(
  message: string,
  recovery: string,
  field?: boolean,
  params?: Record<string, string | number>,
): ConnectionError {
  return {
    get message() {
      return t(message, params);
    },
    get recovery() {
      return t(recovery);
    },
    field,
  };
}

export function connectionProgressKey(text: string) {
  if (text.includes("Loading encryption engine")) return "loadingEngine";
  if (text.includes("Checking for a local direct connection"))
    return "tryingDirect";
  if (text.includes("Could not establish a direct connection"))
    return "usingRelay";
  if (text.includes("Local direct connection established"))
    return "directReady";
  return "connectingDevice";
}

export const connectionProgress = (text: string) =>
  t(connectionProgressKey(text));

export function connectionError(error: unknown): ConnectionError {
  const text = error instanceof Error ? error.message : String(error);
  if (/pairing|invalid.*addr/i.test(text))
    return errorCopy("pairInvalid", "pairInvalidRecovery", true);
  if (/WASM|WebAssembly|encryption runtime|fetch/i.test(text))
    return errorCopy("engineFailed", "engineRecovery");
  if (/does not support Service Workers/i.test(text))
    return errorCopy("browserUnsupported", "browserRecovery");
  if (/Page bridge failed to initialize/i.test(text))
    return errorCopy("appNotReady", "appRecovery");
  const upstream = text.match(/upstream returned HTTP (\d{3})/i);
  if (upstream)
    return errorCopy("upstreamHTTP", "upstreamRecovery", false, {
      status: upstream[1],
    });
  if (/HTML/.test(text)) return errorCopy("noHTML", "noHTMLRecovery");
  if (/probe.only|Bandwidth probe mode/i.test(text))
    return errorCopy("probeOnly", "probeRecovery");
  if (/timeout|deadline/i.test(text))
    return errorCopy("timeout", "timeoutRecovery");
  if (/interrupted|disconnected|closed/i.test(text))
    return errorCopy("connectionClosed", "closedRecovery");
  if (/integrity/i.test(text))
    return errorCopy("integrityFailed", "integrityRecovery");
  return errorCopy("operationFailed", "operationRecovery");
}
