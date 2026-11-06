import "../public/__relay/i18n.js";
import { useSyncExternalStore } from "preact/compat";

export type LanguagePreference = "auto" | "zh-CN" | "en" | "ja";

declare global {
  interface Window {
    relayI18n: {
      readonly locale: "zh-CN" | "en" | "ja";
      readonly preference: LanguagePreference;
      t(key: string, params?: Record<string, string | number>): string;
      applyDocument(): void;
      setPreference(value: LanguagePreference): void;
      subscribe(listener: () => void): () => void;
    };
  }
}

export const { t } = window.relayI18n;
const subscribe = (listener: () => void) =>
  window.relayI18n.subscribe(() => {
    if (!window.relayApplication) listener();
  });
const snapshot = () =>
  window.relayI18n.preference + ":" + window.relayI18n.locale;
export function useLanguage() {
  useSyncExternalStore(subscribe, snapshot);
  return window.relayI18n.preference;
}
window.relayI18n.applyDocument();
window.relayI18n.subscribe(() => {
  if (!window.relayApplication) window.relayI18n.applyDocument();
});
