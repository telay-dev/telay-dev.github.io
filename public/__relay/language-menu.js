// Shared by the home page, standalone pages, and embedded apps; changes only Telay controls, not upstream documents.
(() => {
  const entries = [
    ["auto", "", null],
    ["zh-CN", "ZH", "Chinese"],
    ["en", "EN", "English"],
    ["ja", "JA", "Japanese"],
  ];
  function mount(host) {
    const { t } = window.relayI18n;
    host.innerHTML =
      '<style>.telay-language{position:relative;font:12px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#6c675f}.telay-language summary{display:flex;align-items:center;gap:10px;min-height:44px;padding:0 4px;list-style:none;cursor:pointer;border:0;background:transparent;box-shadow:none;border-radius:0}.telay-language summary::-webkit-details-marker{display:none}.telay-language summary span{opacity:1}.telay-language summary span[data-active=true]{opacity:1;color:#302d29;font-weight:600}.telay-language .language-options{position:absolute;right:0;top:100%;z-index:30;min-width:140px;padding:4px 0;background:#f7f5f0;border:0;box-shadow:none}.telay-language button{display:flex;align-items:center;gap:12px;min-height:44px;width:100%;padding:8px 12px;border:0;border-radius:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;box-shadow:none}.telay-language button:hover{color:#302d29;background:#eeebe4}.telay-language button[aria-pressed=true]{color:#a74d35}.telay-language button span:first-child{width:20px;flex-shrink:0}.telay-language summary:focus-visible,.telay-language button:focus-visible{outline:2px solid #a74d35;outline-offset:2px;box-shadow:none}</style><details class="telay-language"><summary><span lang="zh-CN" data-symbol="zh-CN">ZH</span><span lang="en" data-symbol="en">EN</span><span lang="ja" data-symbol="ja">JA</span></summary><div class="language-options"></div></details>';
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
      host.querySelector("[data-language=auto]").lastElementChild.textContent =
        t("languageAuto");
      for (const button of options.querySelectorAll("button"))
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.language === window.relayI18n.preference),
        );
      for (const symbol of summary.querySelectorAll("span"))
        symbol.dataset.active = String(
          symbol.dataset.symbol === window.relayI18n.locale,
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
