# Telay Connector

The connector exposes one user-selected loopback HTTP service to the paired browser. It supports HTTP, WebSocket, and SSE, tries WebRTC direct transport first, and falls back to DERP. It is not an open proxy.

## Run

Download the executable for your operating system or build from source with Go 1.27.2+:

```sh
go build -o telay .
./telay --web https://telay.js.org --upstream 'http://127.0.0.1:3080/'
```

Omit `--upstream` to enter the URL interactively. The URL may include local authentication parameters; it is not uploaded to Telay. Keep the printed `tc` pairing address private. Restarting the connector creates a new address.

Use `--profile dsh` for DeepSeek DSH integration, or `--probe-only` for a bandwidth test. `--help` lists all options.

## Build and verify

```sh
go test -race ./...
GOOS=linux GOARCH=arm64 go build -o telay .
```

The static site can also be hosted from any HTTPS origin; set `--web` to that origin.

## Security and limits

The connector only reaches the configured loopback service. It does not proxy other LAN hosts, cloud APIs, or arbitrary TCP. It keeps upstream authentication in a local cookie jar and does not return upstream cookies to the browser. Request paths cannot change host or traverse directories. Writes are not replayed after disconnect. The pairing address grants device access, so use it only with trusted devices and pages.

Third-party license details are in `THIRD_PARTY_NOTICES.txt`; complete license texts are published as a separate download.
