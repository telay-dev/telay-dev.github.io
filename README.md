# Telay

Telay connects a browser to a user-selected local HTTP service through a small Go connector. It supports HTTP, WebSocket, and server-sent events, prefers a WebRTC local connection, and falls back to a public DERP relay. It does not modify the upstream application.

The browser WebAssembly entry is kept beside the connector in `connector/browser`. The standalone page stays at `/__relay/index.html` because that URL is used by the service worker and connection flow.

## Development

Requirements: Node.js 22+, pnpm 10+, and Go 1.27.2+.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm build
```

Build platform executables and the static site with:

```sh
pnpm release
pnpm build
```

Run project checks with `pnpm test` and `cd connector && go test -race ./...`.

Start the connector with a site origin and a local service URL:

```sh
./telay --web https://telay.js.org --upstream 'http://127.0.0.1:3080/'
```

## Releases and hosting

Pushing to `main` builds macOS, Linux, and Windows executables, publishes checksum-verified downloads and third-party license texts, and deploys the static site to GitHub Pages. The site uses `public/CNAME` for `telay.js.org`. Enable GitHub Pages with GitHub Actions in repository settings. Request the `telay.js.org` subdomain through [JS.ORG](https://github.com/js-org/js.org).

The interface supports English, Simplified Chinese, and Japanese. Strings are maintained in `public/__relay/i18n.js`.

## Licensing

Telay is licensed under MIT. Third-party notices and license texts are published as standalone text files in `public/downloads`.
