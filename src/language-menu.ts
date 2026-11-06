import "./i18n";
import "./relay-runtime/language-menu.js";

declare global {
  interface Window {
    telayLanguageMenu: { mount(host: HTMLElement): () => void };
  }
}
