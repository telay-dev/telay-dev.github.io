# Telay

Telay connects a browser to a user-selected local HTTP service through a small Go connector. It supports HTTP, WebSocket, and server-sent events, prefers a WebRTC local connection, and falls back to a public DERP relay. It does not modify the upstream application.

## Development

Requirements: Node.js 22+, pnpm 10+, and Go 1.27.2+.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm build
```

Build connector archives and the static site with:

```sh
cd connector && go mod vendor && cd ..
node scripts/build-connectors.mjs
node scripts/package-release.mjs
pnpm build
```

Run the frontend checks with `node scripts/test-i18n.mjs`, `node scripts/test-history-cache.mjs`, `node scripts/test-streaming.mjs`, and `node scripts/test-install.mjs`. Run connector checks with `cd connector && go test -race ./...`.

Start the connector with a site origin and a local service URL:

```sh
./telay --web https://telay.js.org --upstream 'http://127.0.0.1:3080/'
```

## Releases and hosting

Pushing to `main` builds macOS, Linux, and Windows connector archives, publishes checksum-verified downloads, and deploys the static site to GitHub Pages. The site uses `public/CNAME` for `telay.js.org`. Enable GitHub Pages with GitHub Actions in repository settings. Request the `telay.js.org` subdomain through [JS.ORG](https://github.com/js-org/js.org).

The interface supports English, Simplified Chinese, and Japanese. Strings are maintained in `public/__relay/i18n.js`.

## Licensing

Telay is licensed under MIT. Third-party notices and license texts are included in connector distributions; see `connector/THIRD_PARTY_NOTICES.txt` and the generated `THIRD_PARTY_LICENSES.zip`.
