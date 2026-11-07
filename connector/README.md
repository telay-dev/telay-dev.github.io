# Connector

The connector exposes one configured loopback HTTP service to the paired browser. It is not an open proxy. It keeps upstream authentication local and does not return upstream cookies to the browser.

Run the published connector with `npx telay-cli --web https://telay.js.org --upstream http://127.0.0.1:3080/`.

To build from source:

```sh
go build -o telay .
./telay --web https://telay.js.org --upstream http://127.0.0.1:3080/
```

Omit `--upstream` to enter the URL interactively. See `telay --help` for all options. Keep the printed pairing address private.

Pairing identities are saved by default under the OS user configuration directory in `telay/identities/`. Each upstream service gets its own identity file; changes to the initial authentication query do not change the identity. The connector prints the file path at startup. Restarting with the same file reuses the exact pairing address, although active connections still close and the browser must reconnect. Upstream authentication is established again from the startup URL; upstream cookies are not persisted.

Use `--state /path/to/identity.json` to select a file explicitly, or `--ephemeral` to create a temporary identity without saving it. Identity files contain private keys and must stay local. Only one connector can use a file at a time. To rotate the pairing identity, stop the connector and choose a new state file. An old pairing address alone cannot recover an identity whose private key was never saved.

Build and check with Go 1.27.2+:

```sh
go test -race ./...
GOOS=linux GOARCH=arm64 go build -o telay .
```

GitHub Releases provides executables, checksums, and third-party license files as separate downloads. The notice source is `../THIRD_PARTY_NOTICES.txt`.
