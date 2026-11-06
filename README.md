# Telay

通用浏览器连接入口与本机 Go 连接器。HTTP / WebSocket / SSE，局域网直连优先，公共 DERP 后备；不修改上游应用源码。

## 目录

- `src`、`public`、`__relay`：React 页面、Service Worker 与浏览器运行时。
- `connector`：Go 连接器、测试、隔离验收服务及 vendored 依赖。
- `browser-source`：固定版本 Tailcat WASM 入口和许可；预编译引擎在 `public/tailcat`。
- `scripts`：构建、打包与回归测试。
- `DESIGN.md`、`PRODUCT.md`：设计和产品约束。

不包含 node_modules、Git 历史、开发截图、构建缓存或五平台预编译连接器。浏览器 WASM 与原始第三方许可已包含。

## 开发与构建

需要 Node.js >=22、pnpm 和 Go >=1.27.2；发行打包另需 zip。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

在项目根目录生成五平台下载包与静态网站：

```sh
node scripts/build-connectors.mjs
node scripts/package-release.mjs
pnpm build
```

构建结果在 `dist`。本压缩包未包含原有连接器 ZIP，直接只运行前端构建会缺少下载包；完整分发请先执行上面的两条脚本。

```sh
node scripts/test-i18n.mjs
node scripts/test-history-cache.mjs
node scripts/test-streaming.mjs
node scripts/test-install.mjs
cd connector
go test -race ./...
go build -o telay .
./telay --web 'https://你的连接网站' --upstream 'http://127.0.0.1:3080/?token=你的token'
```

`--web` 只接受网站 origin，暂未适配 GitHub Pages 项目子路径。`--site` 保留兼容。初次配对依赖公共 DERP，其可达性与服务质量需实测。平台二进制交叉构建不等同于目标系统实机测试。

第三方源码、版权和许可须保留；详见 `connector/THIRD_PARTY_NOTICES.txt` 和 `public/downloads/THIRD_PARTY_LICENSES.zip`。
