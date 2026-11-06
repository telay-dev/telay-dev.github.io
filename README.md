# Telay

Connect to a local web service from another device through a browser. The Go connector supports HTTP, WebSocket, and server-sent events. It uses WebRTC when possible and DERP relay otherwise.

## Quick start

Download the executable for your operating system and processor from [GitHub Releases](https://github.com/GitaiQAQ/telay/releases/latest), then run it. For example, on an Apple silicon Mac:

```sh
./telay-darwin-arm64 --upstream http://127.0.0.1:3080/
```

Open [telay.js.org](https://telay.js.org) and enter the pairing address printed by the connector. Keep the address private; it grants access to the configured service.

## Development

Requirements: Node.js 22+, pnpm 10+, and Go 1.27.2+.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm build
pnpm test
cd connector && go test -race ./...
pnpm release
```

`pnpm release` builds executables for macOS, Linux, and Windows. The GitHub Actions workflow publishes downloads on GitHub Releases and deploys the site to [telay.js.org](https://telay.js.org) on pushes to `main`.

Telay is licensed under [MIT](LICENSE). Third-party notices are in [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt).
