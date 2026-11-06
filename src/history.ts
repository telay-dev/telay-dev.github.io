import "./relay-runtime/history.js";
import { useSyncExternalStore } from "preact/compat";
export type RecentAddress = { address: string; title: string };
declare global {
  interface Window {
    relayHistory: {
      readonly entries: RecentAddress[];
      readonly persisted: boolean;
      valid(address: string): boolean;
      save(address: string, title?: string): boolean;
      clear(): boolean;
      subscribe(listener: () => void): () => void;
    };
  }
}
export function useRecentAddresses() {
  return useSyncExternalStore(
    window.relayHistory.subscribe,
    () => window.relayHistory.entries,
  );
}
