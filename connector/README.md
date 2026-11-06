# Connector

The connector exposes one configured loopback HTTP service to the paired browser. It is not an open proxy. It keeps upstream authentication local and does not return upstream cookies to the browser.

```sh
go build -o telay .
./telay --web https://telay.js.org --upstream http://127.0.0.1:3080/
```

Omit `--upstream` to enter the URL interactively. See `telay --help` for all options. Keep the printed pairing address private.

Build and check with Go 1.27.2+:

```sh
go test -race ./...
GOOS=linux GOARCH=arm64 go build -o telay .
```

Third-party notices and license texts are published in `../public/downloads/`.
