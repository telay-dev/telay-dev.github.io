# Telay

Connect a browser to a local web service through the Telay connector. Supports HTTP, WebSocket, and server-sent events, using WebRTC when available and DERP otherwise.

Start the connector with your local service URL:

```sh
./telay --web https://telay.js.org --upstream http://127.0.0.1:3080/
```

Open [telay.js.org](https://telay.js.org) and enter the pairing address printed by the connector. Keep that address private; it grants access to the configured service.

## Development

Requirements: Node.js 22+, pnpm 10+, and Go 1.27.2+.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm build
pnpm test
pnpm release
cd connector && go test -race ./...
```

`pnpm release` builds macOS, Linux, and Windows connector binaries and their license files. GitHub Actions publishes downloads and deploys the site on pushes to `main`. Enable GitHub Pages for the repository; `public/CNAME` sets `telay.js.org`.

The interface is available in English, Simplified Chinese, and Japanese. Telay is licensed under [MIT](LICENSE); third-party notices and license texts are in `public/downloads`.
