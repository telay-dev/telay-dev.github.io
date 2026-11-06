# Telay

这是固定本机上游的通用 HTTP / WebSocket / SSE 连接器，DSH 仅为示例。不修改上游项目源码。

静态网站只分发页面。初次使用 Tailcat 公共 DERP 交换加密信令，然后尝试 WebRTC host candidate 直连。成功后业务数据经浏览器 → WebRTC DataChannel → 本机连接器 → 固定 loopback 服务；未连通则走公共 DERP。不使用 STUN / TURN，不扫描网段。

## 试用

macOS / Linux 可使用网页提供的 wget / curl 安装命令，无需安装 Go。将 `TELAY_WEB` 设置为提供安装脚本的 HTTPS 站点（没有结尾路径）：

```sh
TELAY_WEB=https://你的试用站点
wget -qO- "$TELAY_WEB/install.sh" | sh -s -- --web "$TELAY_WEB"
# 或：curl -fsSL "$TELAY_WEB/install.sh" | sh -s -- --web "$TELAY_WEB"
./telay/telay --web "$TELAY_WEB" --upstream 'http://127.0.0.1:3080/?token=你的token'
```

先审阅 `$TELAY_WEB/install.sh`，再决定是否执行下载的脚本。安装器自动识别 Darwin / Linux、amd64 / arm64，在当前目录新建 `telay/`，不会覆盖已有目录。需要 unzip，以及 sha256sum / shasum / openssl 之一。不使用 sudo，不安装依赖，不修改 PATH，不自动运行连接器。使用 `--dir ./新目录` 改安装位置（父目录须存在），`--downloader wget` / `curl` 指定下载工具。支持 `--help`。

从同站点下载 `downloads/SHA256SUMS` 校验 ZIP 后，仅提取已知文件。此校验用于检测损坏，不是独立签名，仍须信任下载站点。Windows 保留原 ZIP 方式。DSH 可在上述启动命令后加 `--profile dsh`；通用模式按提示粘贴本机 HTTP URL，或指定 `--upstream`。安装管道不启动程序，避免其交互输入被管道占用。

1. 在工作目录运行 `npx @deepseek-ai/dsh web --no-open`（Node.js >=24.9），或保持现有 DSH Web 运行。
2. 运行对应系统连接器，在提示后粘贴终端打印的完整 URL，如 `http://127.0.0.1:3080/?token=...`。不要把 URL 发给网站或其他人。
3. 启动时加 `--web https://当前试用网站地址` 会打印手机配对链接；粘贴 tc 地址后点「连接」，再点「打开应用」。连接选项中可「新标签页打开」或展开诊断测速。安装和帮助默认折叠。独立入口为 `/__relay/index.html`，无需保留安装页，无 iframe / parent / opener。应用右下角「Telay」菜单提供全屏、新标签页和断开。成功连接后在浏览器 localStorage 记住最多五条配对地址，可清除；预填但不自动连接，共享设备上请清除记录。

其他应用：`./telay-对应系统 --upstream http://127.0.0.1:你的端口/ --web https://你的站点`。默认 `--profile generic`；DSH 建议加 `--profile dsh`，以保留本机 launch token 交换路径的额外限制。两者都只连接启动时指定的固定上游，不是开放代理。

macOS/Linux 解压后 `chmod +x telay-*`，运行 `./telay-对应系统`；Windows PowerShell 中运行 `.\telay-windows-amd64.exe`。仅测试中继加 `--probe-only`。Ctrl-C 停止并失效本次连接；重新启动生成新 tc 凭证。

二进制未签名。若操作系统拦截，建议审阅源代码后自行构建；不要关闭系统安全保护。

若 npm 镜像缺少 DSH 依赖，可以改用官方源：`npx --registry=https://registry.npmjs.org @deepseek-ai/dsh web --no-open`。不自动修改你的全局包管理器设置。

指定完整 `--upstream` 可非交互启动，保留 token 和查询串；省略时提示输入。也可将上游 URL 放在所有选项之后作为唯一位置参数。旧 `--site` 保留兼容，推荐使用 `--web`。安装器也接受 `--upstream`，仅加入输出的启动命令，不上传、不自动运行。

网页支持简体中文、英文、日文，默认浏览器语言；「中 EN 日」菜单可手动切换或恢复自动，偏好仅存于本浏览器，不刷新、不掉线、不修改上游应用语言。

## 构建

安装 Go >=1.27.2，在解压源码目录运行 `go build -o telay .`。使用 `--web https://你的静态页面地址` 输出手机链接。`go test ./...` 验证协议和上游边界。Tailcat 版本固定为随包 go.mod 中提交；BSD-3-Clause 许可见 THIRD_PARTY_NOTICES.txt。

## 范围与安全

只访问用户指定的 loopback HTTP IP 和根路径，不代理局域网其他服务、云端模型接口或任意 TCP。认证使用本机 Cookie Jar，Host/Origin 对应真实上游；不给浏览器返回上游 Cookie，不绕过认证。tc 地址包含 PSK，是本机操作授权凭证；请仅用于自己的设备、勿公开。支持 GET / HEAD / POST / PUT / PATCH / DELETE / OPTIONS，同源任意 WebSocket 路径、查询串和子协议；每条业务通道限 6 并发 HTTP、4 个 WebSocket，请求/响应限 32 MiB。路径拒绝跨主机、目录穿越；DSH profile 额外拒绝远程 launch token 交换。

页面及 WASM 使用同源静态分发，配对秘密存于浏览器内存、URL fragment 和可清除的 localStorage 最近记录，不上传网站。网站仍然是信任边界：不要在不可信页面输入 tc 地址。原生 DSH 插件同样属于本机可信代码。本试用版没有多用户配额、审计、撤销面板或正式安全审计，不适合向陌生人公开运营。

直连是实际 ICE 连通性检查，不以 IP 前缀猜测同网段。相同 Wi-Fi 不保证可达：防火墙、AP 隔离、mDNS 和浏览器限制都可能影响结果。协商候选只发给已配对的另一端。直连中断时回退到现有 DERP，关闭旧业务 WebSocket 让应用自行重连；在途 HTTP 可能失败，尤其写操作不会自动重放。

初次协商仍需 DERP 可达，不是完全离线模式。公共 DERP 免费、限速、无 SLA、可能撤销；国内可达性必须实测。两端仍消耗各自网络流量，网站分发也有成本。

通用适配仅改写收到的 HTML 副本，加载同源 relay 脚本和 base URL；不会改上游文件。同源 WebSocket 支持文本、二进制和子协议；SSE 支持原生 EventSource 与 fetch 的 text/event-stream 响应（包括 POST），透传 Last-Event-ID，按需分块读取并支持取消。SSE 不设 90 秒总时限、不落完整响应缓存；隧道断开使流报错，EventSource 按其标准规则重连，fetch 写请求不会自动重放。首部和普通 HTTP 有 90 秒时限；每条隧道最多 16 个 HTTP 请求和 4 个 WebSocket，SSE 单块最多 32 KiB。

HTTP 缓存已实现于浏览器 CacheStorage，名称 relay-http-v1-加配对凭证的 SHA-256，保存原响应及缓存策略，按标准缓存头和条件校验工作；最近地址和语言偏好在 localStorage。普通网站资源仍由浏览器原生 HTTP 缓存处理，是否加速取决于托管响应头。使用新版连接器才启用可靠 HTTP 缓存与 SSE；旧连接器继续支持普通 HTTP/WS，但不启用缓存，EventSource 提示需更新。

普通 HTTP 仍使用有界缓冲，不支持非 SSE 长 HTTP 流、超限附件、应用自带 Service Worker、跨域登录及多域名依赖的透明迁移。依赖 document.cookie 的登录/CSRF、自定义 CSP、原生目录选择等需逐应用验收，不承诺兼容所有 Web 应用。请给此 relay 使用独立域名，不与其他敏感站点共用 origin。DSH 及插件版本兼容性同样需实测。
