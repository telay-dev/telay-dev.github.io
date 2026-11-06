// 入口和应用内菜单共用词典；只翻译 Telay，不改变上游应用的语言。
(() => {
  const messages = {
    "zh-CN": {
      pageTitle: "Telay · 安全访问本地 Web 服务",
      home: "Telay 首页",
      headingLeadHighlight: "安全",
      headingLeadRest: "访问",
      headingDetailBefore: "",
      headingDetailHighlight: "本地",
      headingDetailAfter: " Web 服务",
      pairLabel: "配对地址",
      pairPlaceholder: "粘贴设备端输出的 tc… 地址",
      pairHint: "配对地址相当于访问密码，请勿分享。",
      recentAddresses: "最近连接",
      device: "设备",
      clearHistory: "清除",
      historyPrivacy: "地址保存在此浏览器，请勿在共享设备使用。",
      historyUnavailable: "浏览器未允许保存；本次仅临时记住地址。",
      connect: "连接",
      connectAndOpen: "连接并打开",
      connecting: "连接中…",
      open: "打开应用",
      opening: "打开中…",
      disconnected: "未连接",
      disconnectedRetry: "已断开，可重新连接",
      connectedDirect: "已连接 · 内网直连",
      connectedRelay: "已连接 · 中继",
      connectionOptions: "连接选项",
      loadingEngine: "正在加载连接引擎…",
      tryingDirect: "正在尝试内网直连…",
      usingRelay: "正在使用中继…",
      directReady: "内网直连已就绪",
      connectingDevice: "正在连接设备…",
      preparingApp: "正在准备应用…",
      openingApp: "正在打开应用…",
      newTab: "新标签页打开",
      newTabHint: "新页面将独立连接；未打开时请允许弹出窗口",
      diagnostics: "连接诊断",
      latency: "往返延迟",
      downloadSpeed: "下载速度",
      traffic: "发送 / 接收",
      measure: "测速",
      measuring: "测速中…",
      measureHint: "单次测试下载 256 KiB，结果不代表 SLA。",
      disconnect: "断开连接",
      fullscreen: "全屏",
      exitFullscreen: "退出全屏",
      reconnect: "重新配对",
      closedPairAgain: "已断开，请重新配对",
      fullscreenUnsupported: "此浏览器不支持系统全屏；应用已铺满当前页面",
      fullscreenDenied: "浏览器未允许全屏；应用已铺满当前页面",
      install: "安装连接器",
      help: "帮助",
      installAndHelp: "安装与帮助",
      npmRunIntro: "使用 Node.js 18 或更新版本，在终端运行：",
      installTerminal: "在设备终端安装",
      installTools: "安装工具",
      copyInstall: "复制 {method} 安装命令",
      copyRun: "复制启动命令",
      copyManualRun: "复制手动启动命令",
      copied: "已复制",
      copyFailed: "无法自动复制，请选择命令手动复制。",
      scriptWarning: "此命令会执行下载的脚本。",
      viewScript: "查看脚本",
      runAfterInstall: "安装后启动",
      runHint: "按提示输入本机服务 URL，保持终端运行。",
      upstreamLabel: "本机服务地址（可选）",
      upstreamPlaceholder: "粘贴 DSH 打印的完整 URL（含 token）",
      runDirectHint: "填写后，启动命令将直接传入地址；仅保留在当前页面。",
      otherMethods: "其他方式",
      manualInstall: "Windows 或手动安装：下载对应平台的可执行文件后运行。",
      macApple: "macOS · Apple 芯片",
      macIntel: "macOS · Intel",
      windowsX64: "Windows · x64",
      linuxX64: "Linux · x64",
      linuxArm: "Linux · ARM64",
      chmodBefore: "macOS / Linux 先执行 ",
      chmodAfter: "。",
      installerBefore: "安装器仅支持 macOS / Linux，安装到当前目录的 ",
      installerAfter: "，不覆盖、不提权、不自动启动。需要 SHA-256 工具。",
      unsignedWarning:
        "二进制未签名。校验清单与下载文件来自同一 GitHub Release，不能代替独立签名。被系统拦截时请审阅源码自行构建，不关闭安全保护。",
      checksums: "校验清单",
      licenses: "第三方许可",
      helpConnect:
        "启动连接器，输入设备上的本机 HTTP 服务 URL，再把终端输出的 tc 配对地址粘贴到这里。",
      helpLifecycle:
        "连接后打开应用，页面自行维持连接。刷新后可用已保存的地址重新连接；关闭页面会断开连接。设备端重启会生成新地址，旧记录可能失效。",
      dshSetup: "接入 DSH",
      dshURL: "先在工作目录启动 DSH，使用终端打印的完整 URL（含 token）。",
      dshProfileBefore: "启动连接器时加 ",
      dshProfileAfter: "。DSH 需要 Node.js ≥ 24.9；模型费用仍由你的账号承担。",
      limitations: "连接与使用限制",
      helpDirect:
        "优先尝试 WebRTC 内网直连，失败时使用公共 DERP。相同 Wi-Fi 不保证直连；防火墙、AP 隔离和浏览器权限都可能影响结果。初始协商仍需公共中继可达，不扫描网段。",
      helpRelay:
        "公共 DERP 限速、无 SLA，国内可达性以实际连接为准。静态分发和两端网络仍有流量成本。",
      helpProtocols:
        "支持固定本机 HTTP 服务、同源 WebSocket 和 SSE。普通响应限 32 MiB；不支持其他长 HTTP 流、应用自带 Service Worker、跨域登录或任意网站代理。",
      helpSafety:
        "断线不会自动重放写操作。配对地址授予设备操作权限，请只用于自己的设备，不分享地址或截图。",
      helpIndependence:
        "不修改上游源码，仅对 HTML 响应副本注入通用适配。项目与 DeepSeek、Tailscale 无关联或背书。",
      pairIncomplete: "配对地址不完整。",
      pairIncompleteRecovery: "请从设备端复制完整的 tc… 地址。",
      pairInvalid: "配对地址无效。",
      pairInvalidRecovery: "请复制设备端输出的完整 tc… 地址。",
      engineFailed: "连接引擎未能加载。",
      engineRecovery: "请检查网络后重试。",
      browserUnsupported: "浏览器不支持此连接方式。",
      browserRecovery: "请使用新版 Chrome 或 Safari。",
      appNotReady: "应用页面未能准备就绪。",
      appRecovery: "请刷新并重新配对。",
      upstreamHTTP: "上游返回 HTTP {status}。",
      upstreamRecovery: "请检查本机服务是否运行，URL 是否包含所需认证。",
      noHTML: "应用入口没有返回网页。",
      noHTMLRecovery: "请检查连接器配置的本机服务 URL。",
      probeOnly: "当前连接器仅用于测速。",
      probeRecovery: "请去掉 --probe-only，重新启动连接器。",
      timeout: "连接等待超时。",
      timeoutRecovery: "请检查设备端连接器是否运行、中继网络是否可达，再重试。",
      connectionClosed: "连接已断开。",
      closedRecovery: "请保持设备端连接器运行，重新连接后重试。",
      integrityFailed: "测速校验失败。",
      integrityRecovery: "请检查连接后重新测速。",
      operationFailed: "操作未完成。",
      operationRecovery: "请检查设备端服务和连接器是否运行，然后重试。",
      socketInvalid: "WebSocket URL 无效",
      socketNotOpen: "WebSocket 尚未连接",
      relayNotInitialized: "通用中继连接未初始化",
      appSWUnsupported: "应用自带 Service Worker 暂不支持与中继共用此域名",
      language: "语言",
    },
    en: {
      pageTitle: "Telay · Securely access your local web server",
      home: "Telay home",
      headingLeadHighlight: "Secure",
      headingLeadRest: " access to",
      headingDetailBefore: "your ",
      headingDetailHighlight: "local",
      headingDetailAfter: " web server",
      pairLabel: "Pairing address",
      pairPlaceholder: "Paste your device’s tc… address",
      pairHint: "This address grants access to your device. Keep it private.",
      recentAddresses: "Recent connections",
      device: "Device",
      clearHistory: "Clear",
      historyPrivacy: "Saved in this browser. Avoid shared devices.",
      historyUnavailable:
        "Storage is unavailable. Remembered for this page only.",
      connect: "Connect",
      connectAndOpen: "Connect and open",
      connecting: "Connecting…",
      open: "Open app",
      opening: "Opening…",
      disconnected: "Not connected",
      disconnectedRetry: "Disconnected. You can reconnect.",
      connectedDirect: "Connected · Local network",
      connectedRelay: "Connected · Relay",
      connectionOptions: "Connection options",
      loadingEngine: "Loading connection engine…",
      tryingDirect: "Trying a local connection…",
      usingRelay: "Using relay…",
      directReady: "Local connection ready",
      connectingDevice: "Connecting to device…",
      preparingApp: "Preparing app…",
      openingApp: "Opening app…",
      newTab: "Open in new tab",
      newTabHint:
        "The new tab connects independently. Allow pop-ups if it did not open.",
      diagnostics: "Connection diagnostics",
      latency: "Round-trip latency",
      downloadSpeed: "Download speed",
      traffic: "Sent / received",
      measure: "Test speed",
      measuring: "Testing…",
      measureHint: "Each test downloads 256 KiB. Results are not an SLA.",
      disconnect: "Disconnect",
      fullscreen: "Full screen",
      exitFullscreen: "Exit full screen",
      reconnect: "Pair again",
      closedPairAgain: "Disconnected. Pair again to reconnect.",
      fullscreenUnsupported:
        "Full screen is unavailable. The app already fills this page.",
      fullscreenDenied:
        "Full screen was not allowed. The app already fills this page.",
      install: "Install connector",
      help: "Help",
      installAndHelp: "Installation and help",
      npmRunIntro: "With Node.js 18 or later, run in your terminal:",
      installTerminal: "Install in your device terminal",
      installTools: "Installation tool",
      copyInstall: "Copy {method} install command",
      copyRun: "Copy start command",
      copyManualRun: "Copy manual start command",
      copied: "Copied",
      copyFailed: "Could not copy. Select and copy the command manually.",
      scriptWarning: "This command runs a downloaded script.",
      viewScript: "View script",
      runAfterInstall: "Start after installing",
      runHint:
        "Enter your local service URL when prompted. Keep the terminal running.",
      upstreamLabel: "Local service URL (optional)",
      upstreamPlaceholder: "Paste the full DSH URL, including its token",
      runDirectHint:
        "The start command will include this URL. Kept on this page only.",
      otherMethods: "Other options",
      manualInstall:
        "For Windows or manual setup, download and run the executable for your platform.",
      macApple: "macOS · Apple silicon",
      macIntel: "macOS · Intel",
      windowsX64: "Windows · x64",
      linuxX64: "Linux · x64",
      linuxArm: "Linux · ARM64",
      chmodBefore: "On macOS / Linux, first run ",
      chmodAfter: ".",
      installerBefore: "The installer supports macOS / Linux and creates ",
      installerAfter:
        " in the current directory. No overwriting, elevated privileges, or automatic launch. Requires a SHA-256 tool.",
      unsignedWarning:
        "Binaries are unsigned. Checksums and downloads come from the same GitHub release and are not independent signatures. If blocked, review the source and build it yourself. Do not disable security protections.",
      checksums: "Checksums",
      licenses: "Third-party licenses",
      helpConnect:
        "Start the connector, enter the local HTTP service URL on your device, then paste its tc pairing address here.",
      helpLifecycle:
        "The app maintains its own connection. After a refresh, reconnect with a saved address. Closing the page disconnects it. Restarting the connector creates a new address; old records may stop working.",
      dshSetup: "Use with DSH",
      dshURL:
        "Start DSH in your working directory. Use the complete URL printed in the terminal, including its token.",
      dshProfileBefore: "Start the connector with ",
      dshProfileAfter:
        ". DSH requires Node.js ≥ 24.9. Model charges still apply to your account.",
      limitations: "Connection limits",
      helpDirect:
        "WebRTC tries a local connection first, then falls back to public DERP. Sharing Wi-Fi does not guarantee a direct connection: firewalls, AP isolation, and browser permissions can interfere. Initial negotiation still requires a reachable public relay. No subnet scanning.",
      helpRelay:
        "Public DERP is rate-limited with no SLA. Test actual reachability in mainland China. Static downloads and both endpoints still incur network traffic.",
      helpProtocols:
        "Supports a fixed local HTTP service, same-origin WebSocket, and SSE. Regular responses are limited to 32 MiB. Other long HTTP streams, app Service Workers, cross-origin sign-in, and arbitrary-site proxying are not supported.",
      helpSafety:
        "Writes are not replayed after disconnection. Pairing addresses grant device access. Use only your own devices and do not share addresses or screenshots.",
      helpIndependence:
        "Upstream source is unchanged. Generic adaptation is injected only into the HTML response copy. This project is not affiliated with or endorsed by DeepSeek or Tailscale.",
      pairIncomplete: "The pairing address is incomplete.",
      pairIncompleteRecovery: "Copy the complete tc… address from your device.",
      pairInvalid: "The pairing address is invalid.",
      pairInvalidRecovery:
        "Copy the complete tc… address printed on your device.",
      engineFailed: "Could not load the connection engine.",
      engineRecovery: "Check your network and try again.",
      browserUnsupported: "This browser does not support this connection.",
      browserRecovery: "Use an up-to-date Chrome or Safari.",
      appNotReady: "The app page is not ready.",
      appRecovery: "Refresh and pair again.",
      upstreamHTTP: "Upstream returned HTTP {status}.",
      upstreamRecovery:
        "Check that the local service is running and its URL includes the required credentials.",
      noHTML: "The app entry did not return a webpage.",
      noHTMLRecovery:
        "Check the local service URL configured in the connector.",
      probeOnly: "This connector is in speed-test mode.",
      probeRecovery: "Remove --probe-only and restart the connector.",
      timeout: "The connection timed out.",
      timeoutRecovery:
        "Check that the connector is running and the relay is reachable, then retry.",
      connectionClosed: "The connection is closed.",
      closedRecovery: "Keep the connector running. Reconnect and try again.",
      integrityFailed: "The speed-test integrity check failed.",
      integrityRecovery: "Check your connection and test again.",
      operationFailed: "The operation did not complete.",
      operationRecovery:
        "Check that the local service and connector are running, then retry.",
      socketInvalid: "Invalid WebSocket URL",
      socketNotOpen: "WebSocket is not connected",
      relayNotInitialized: "Telay connection is not initialized",
      appSWUnsupported:
        "App Service Workers cannot share this origin with Telay yet",
      language: "Language",
    },
    ja: {
      pageTitle: "Telay · ローカル Web サーバーに安全にアクセス",
      home: "Telay ホーム",
      headingLeadHighlight: "ローカル",
      headingLeadRest: " Web サーバーに",
      headingDetailBefore: "",
      headingDetailHighlight: "安全",
      headingDetailAfter: "にアクセス",
      pairLabel: "ペアリングアドレス",
      pairPlaceholder: "デバイスの tc… アドレスを貼り付け",
      pairHint:
        "このアドレスはアクセス用の秘密情報です。共有しないでください。",
      recentAddresses: "最近の接続",
      device: "デバイス",
      clearHistory: "消去",
      historyPrivacy:
        "このブラウザに保存されます。共有デバイスでは使用しないでください。",
      historyUnavailable: "保存できません。このページでのみ記憶します。",
      connect: "接続",
      connectAndOpen: "接続して開く",
      connecting: "接続中…",
      open: "アプリを開く",
      opening: "開いています…",
      disconnected: "未接続",
      disconnectedRetry: "切断されました。再接続できます。",
      connectedDirect: "接続済み · ローカルネットワーク",
      connectedRelay: "接続済み · 中継",
      connectionOptions: "接続オプション",
      loadingEngine: "接続エンジンを読み込み中…",
      tryingDirect: "直接接続を試行中…",
      usingRelay: "中継を使用中…",
      directReady: "直接接続の準備ができました",
      connectingDevice: "デバイスに接続中…",
      preparingApp: "アプリを準備中…",
      openingApp: "アプリを開いています…",
      newTab: "新しいタブで開く",
      newTabHint:
        "新しいタブは独立して接続します。開かない場合はポップアップを許可してください。",
      diagnostics: "接続診断",
      latency: "往復遅延",
      downloadSpeed: "ダウンロード速度",
      traffic: "送信 / 受信",
      measure: "速度を測定",
      measuring: "測定中…",
      measureHint:
        "1 回の測定で 256 KiB を受信します。SLA を保証するものではありません。",
      disconnect: "切断",
      fullscreen: "全画面",
      exitFullscreen: "全画面を終了",
      reconnect: "再ペアリング",
      closedPairAgain: "切断されました。再ペアリングしてください。",
      fullscreenUnsupported:
        "全画面に対応していません。アプリは現在のページ全体を使用しています。",
      fullscreenDenied:
        "全画面が許可されませんでした。アプリは現在のページ全体を使用しています。",
      install: "コネクタをインストール",
      help: "ヘルプ",
      installAndHelp: "インストールとヘルプ",
      npmRunIntro: "Node.js 18 以降で、ターミナルから実行：",
      installTerminal: "デバイスのターミナルでインストール",
      installTools: "インストールツール",
      copyInstall: "{method} のインストールコマンドをコピー",
      copyRun: "起動コマンドをコピー",
      copyManualRun: "手動起動コマンドをコピー",
      copied: "コピーしました",
      copyFailed:
        "コピーできません。コマンドを選択して手動でコピーしてください。",
      scriptWarning: "このコマンドはダウンロードしたスクリプトを実行します。",
      viewScript: "スクリプトを確認",
      runAfterInstall: "インストール後に起動",
      runHint:
        "表示に従ってローカルサービスの URL を入力し、ターミナルを開いたままにしてください。",
      upstreamLabel: "ローカルサービスの URL（任意）",
      upstreamPlaceholder:
        "DSH が表示した完全な URL を貼り付け（token を含む）",
      runDirectHint:
        "起動コマンドにこの URL を追加します。このページにのみ保持します。",
      otherMethods: "その他の方法",
      manualInstall:
        "Windows または手動の場合、対応する実行ファイルをダウンロードして実行してください。",
      macApple: "macOS · Apple シリコン",
      macIntel: "macOS · Intel",
      windowsX64: "Windows · x64",
      linuxX64: "Linux · x64",
      linuxArm: "Linux · ARM64",
      chmodBefore: "macOS / Linux では先に ",
      chmodAfter: " を実行してください。",
      installerBefore:
        "インストーラは macOS / Linux に対応し、現在のディレクトリに ",
      installerAfter:
        " を作成します。上書き、権限昇格、自動起動は行いません。SHA-256 ツールが必要です。",
      unsignedWarning:
        "バイナリは未署名です。チェックサムとダウンロードは同じ GitHub Release にあり、独立した署名ではありません。ブロックされた場合はソースを確認してビルドし、保護機能は無効にしないでください。",
      checksums: "チェックサム",
      licenses: "サードパーティライセンス",
      helpConnect:
        "コネクタを起動し、デバイス上のローカル HTTP サービスの URL を指定して、表示された tc アドレスをここに貼り付けます。",
      helpLifecycle:
        "アプリ自身が接続を維持します。更新後は保存したアドレスで再接続でき、ページを閉じると切断されます。コネクタの再起動でアドレスが変わり、以前の記録は使えなくなる場合があります。",
      dshSetup: "DSH に接続",
      dshURL:
        "作業ディレクトリで DSH を起動し、ターミナルに表示された完全な URL（token を含む）を使用します。",
      dshProfileBefore: "コネクタの起動時に ",
      dshProfileAfter:
        " を追加します。DSH には Node.js ≥ 24.9 が必要です。モデルの料金は利用者のアカウントに請求されます。",
      limitations: "接続と利用の制限",
      helpDirect:
        "WebRTC による直接接続を優先し、失敗した場合は公開 DERP を使用します。同じ Wi-Fi でも直接接続ができるとは限りません。ファイアウォールや AP 分離、ブラウザの権限に影響されます。初期の接続交渉にも公開中継が必要です。ネットワークの走査は行いません。",
      helpRelay:
        "公開 DERP には速度制限があり、SLA はありません。中国本土での到達性は実際に確認してください。静的ファイルの配信と両端の通信には帯域コストがかかります。",
      helpProtocols:
        "固定のローカル HTTP サービス、同一オリジンの WebSocket、SSE に対応します。通常の応答は 32 MiB までです。他の長時間 HTTP ストリーム、アプリ独自の Service Worker、クロスオリジン認証、任意のサイトのプロキシには対応しません。",
      helpSafety:
        "切断後に書き込み操作を自動再送しません。ペアリングアドレスはデバイス操作を許可します。自分のデバイスにのみ使用し、アドレスやスクリーンショットを共有しないでください。",
      helpIndependence:
        "上流のソースは変更せず、HTML 応答のコピーに汎用アダプタを追加します。DeepSeek や Tailscale との提携や推奨を示すものではありません。",
      pairIncomplete: "ペアリングアドレスが不完全です。",
      pairIncompleteRecovery:
        "デバイスから完全な tc… アドレスをコピーしてください。",
      pairInvalid: "ペアリングアドレスが無効です。",
      pairInvalidRecovery:
        "デバイスに表示された完全な tc… アドレスをコピーしてください。",
      engineFailed: "接続エンジンを読み込めませんでした。",
      engineRecovery: "ネットワークを確認して再試行してください。",
      browserUnsupported: "このブラウザは接続方式に対応していません。",
      browserRecovery: "最新版の Chrome または Safari を使用してください。",
      appNotReady: "アプリの準備ができませんでした。",
      appRecovery: "ページを更新して再ペアリングしてください。",
      upstreamHTTP: "上流が HTTP {status} を返しました。",
      upstreamRecovery:
        "ローカルサービスが稼働しているか、URL に必要な認証情報が含まれるか確認してください。",
      noHTML: "アプリの入口が Web ページを返しませんでした。",
      noHTMLRecovery:
        "コネクタに指定したローカルサービスの URL を確認してください。",
      probeOnly: "コネクタは速度測定モードです。",
      probeRecovery: "--probe-only を外してコネクタを再起動してください。",
      timeout: "接続がタイムアウトしました。",
      timeoutRecovery:
        "コネクタの稼働と中継への接続を確認して再試行してください。",
      connectionClosed: "接続が切断されました。",
      closedRecovery: "コネクタを起動したまま、再接続して試してください。",
      integrityFailed: "速度測定の整合性確認に失敗しました。",
      integrityRecovery: "接続を確認して再測定してください。",
      operationFailed: "操作を完了できませんでした。",
      operationRecovery:
        "ローカルサービスとコネクタの稼働を確認して再試行してください。",
      socketInvalid: "WebSocket の URL が無効です",
      socketNotOpen: "WebSocket が未接続です",
      relayNotInitialized: "Telay の接続が初期化されていません",
      appSWUnsupported:
        "アプリの Service Worker は Telay と同じオリジンを共有できません",
      language: "言語",
    },
  };

  function selectLocale(languages) {
    for (const language of languages || []) {
      if (/^zh(?:-|$)/i.test(language)) return "zh-CN";
      if (/^en(?:-|$)/i.test(language)) return "en";
      if (/^ja(?:-|$)/i.test(language)) return "ja";
    }
    return "en";
  }
  const storageKey = "relay.language";
  const valid = (value) => ["auto", "zh-CN", "en", "ja"].includes(value);
  let preference = "auto";
  try {
    const saved = localStorage.getItem(storageKey);
    if (valid(saved)) preference = saved;
  } catch {
    /* Language selection remains available without storage. */
  }
  const browserLocale = () =>
    selectLocale(
      navigator.languages?.length ? navigator.languages : [navigator.language],
    );
  let locale = preference === "auto" ? browserLocale() : preference;
  const listeners = new Set();
  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
  function setPreference(value, persist = true) {
    if (!valid(value)) throw new Error("Invalid Relay language preference");
    const nextLocale = value === "auto" ? browserLocale() : value;
    const changed = value !== preference || nextLocale !== locale;
    preference = value;
    locale = nextLocale;
    if (persist) {
      try {
        if (value === "auto") localStorage.removeItem(storageKey);
        else localStorage.setItem(storageKey, value);
      } catch {
        /* Storage is optional. */
      }
    }
    if (changed) for (const listener of listeners) listener();
  }
  window.addEventListener("languagechange", () => {
    if (preference === "auto") setPreference("auto", false);
  });
  window.addEventListener("storage", (event) => {
    if (event.key === storageKey || event.key === null)
      setPreference(valid(event.newValue) ? event.newValue : "auto", false);
  });
  function t(key, params = {}) {
    const template = messages[locale][key] ?? messages.en[key];
    if (template === undefined)
      throw new Error("Missing Relay translation: " + key);
    return template.replace(/\{(\w+)\}/g, (match, name) =>
      params[name] === undefined ? match : String(params[name]),
    );
  }
  function applyDocument() {
    document.documentElement.lang = locale;
    document.title = t("pageTitle");
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    for (const attr of ["placeholder", "aria-label"]) {
      document.querySelectorAll("[data-i18n-" + attr + "]").forEach((el) => {
        el.setAttribute(attr, t(el.getAttribute("data-i18n-" + attr)));
      });
    }
    document.querySelectorAll("[data-relay-language]").forEach((select) => {
      select.value = preference;
      select.onchange = () => setPreference(select.value);
    });
  }
  window.relayI18n = Object.freeze({
    get locale() {
      return locale;
    },
    get preference() {
      return preference;
    },
    t,
    selectLocale,
    applyDocument,
    setPreference,
    subscribe,
  });
})();
