import './i18n';
import '../public/__relay/language-menu.js';

declare global {
  interface Window {telayLanguageMenu:{mount(host:HTMLElement):()=>void}}
}
