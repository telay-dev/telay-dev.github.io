import {t} from './i18n';

export type ConnectionError = {message: string; recovery: string; field?: boolean};

export function errorCopy(message: string, recovery: string, field?: boolean, params?: Record<string, string | number>): ConnectionError {
  return {get message() {return t(message, params)}, get recovery() {return t(recovery)}, field};
}

export function connectionProgressKey(text: string) {
  if (text.includes('加载')) return 'loadingEngine';
  if (text.includes('检查')) return 'tryingDirect';
  if (text.includes('未能直连')) return 'usingRelay';
  if (text.includes('直连成功')) return 'directReady';
  return 'connectingDevice';
}

export const connectionProgress = (text: string) => t(connectionProgressKey(text));

export function connectionError(error: unknown): ConnectionError {
  const text = error instanceof Error ? error.message : String(error);
  if (/配对|invalid.*addr/i.test(text)) return errorCopy('pairInvalid', 'pairInvalidRecovery', true);
  if (/WASM|引擎|WebAssembly|fetch/i.test(text)) return errorCopy('engineFailed', 'engineRecovery');
  if (/不支持 Service Worker/.test(text)) return errorCopy('browserUnsupported', 'browserRecovery');
  if (/载体初始化/.test(text)) return errorCopy('appNotReady', 'appRecovery');
  const upstream = text.match(/上游返回 HTTP (\d{3})/);
  if (upstream) return errorCopy('upstreamHTTP', 'upstreamRecovery', false, {status: upstream[1]});
  if (/HTML/.test(text)) return errorCopy('noHTML', 'noHTMLRecovery');
  if (/probe.only|仅测速/i.test(text)) return errorCopy('probeOnly', 'probeRecovery');
  if (/超时|timeout|deadline/i.test(text)) return errorCopy('timeout', 'timeoutRecovery');
  if (/断开|closed/i.test(text)) return errorCopy('connectionClosed', 'closedRecovery');
  if (/完整性/.test(text)) return errorCopy('integrityFailed', 'integrityRecovery');
  return errorCopy('operationFailed', 'operationRecovery');
}
