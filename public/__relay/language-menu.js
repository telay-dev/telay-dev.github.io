// Shared by the home page, standalone pages, and embedded apps; changes only Telay controls, not upstream documents.
(() => {
  const entries = [
    ["zh-CN", "ZH", "Chinese"],
    ["en", "EN", "English"],
    ["ja", "JA", "Japanese"],
  ];
  function mount(host) {
    const { t } = window.relayI18n;
    host.innerHTML =
      '<style>.telay-language{position:relative;font:12px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#6c675f}.telay-language summary{display:flex;align-items:center;gap:10px;min-height:44px;padding:0 4px;list-style:none;cursor:pointer;border:0;background:transparent;box-shadow:none;border-radius:0}.telay-language summary::-webkit-details-marker{display:none}.telay-language summary svg{width:22px;height:22px;fill:currentColor}.telay-language .language-options{position:absolute;right:0;top:100%;z-index:30;min-width:140px;padding:4px 0;background:#f7f5f0;border:0;box-shadow:none}.telay-language button{display:flex;align-items:center;gap:12px;min-height:44px;width:100%;padding:8px 12px;border:0;border-radius:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;box-shadow:none}.telay-language button:hover{color:#302d29;background:#eeebe4}.telay-language button[aria-pressed=true]{color:#a74d35}.telay-language button span:first-child{width:20px;flex-shrink:0}.telay-language summary:focus-visible,.telay-language button:focus-visible{outline:2px solid #a74d35;outline-offset:2px;box-shadow:none}</style><details class="telay-language"><summary><svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" viewBox="0 0 24 24"><path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/></svg></summary><div class="language-options"></div></details>';
    const details = host.querySelector("details");
    const summary = host.querySelector("summary");
    const options = host.querySelector(".language-options");
    for (const [value, symbol, label] of entries) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.language = value;
      button.innerHTML = '<span aria-hidden="true"></span><span></span>';
      button.firstElementChild.textContent = symbol;
      if (label) {
        button.lastElementChild.textContent = label;
        button.lang = value;
      }
      button.onclick = () => {
        window.relayI18n.setPreference(value);
        details.open = false;
        summary.focus();
      };
      options.append(button);
    }
    const update = () => {
      host.lang = window.relayI18n.locale;
      summary.setAttribute("aria-label", t("language"));
      options.setAttribute("aria-label", t("language"));
      for (const button of options.querySelectorAll("button"))
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.language === window.relayI18n.locale),
        );
    };
    const outside = (event) => {
      if (!event.composedPath().includes(host)) details.open = false;
    };
    const escape = (event) => {
      if (event.key === "Escape" && details.open) {
        details.open = false;
        summary.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    host.addEventListener("keydown", escape);
    const unsubscribe = window.relayI18n.subscribe(update);
    update();
    return () => {
      unsubscribe();
      document.removeEventListener("pointerdown", outside);
      host.removeEventListener("keydown", escape);
    };
  }
  window.telayLanguageMenu = Object.freeze({ mount });
  document.querySelectorAll("[data-language-menu]").forEach((host) => {
    const cleanup = mount(host);
    window.addEventListener("pagehide", cleanup, { once: true });
  });
})();
