# Connector

The connector exposes one configured loopback HTTP service to the paired browser. It is not an open proxy. It keeps upstream authentication local and does not return upstream cookies to the browser.

```sh
go build -o telay .
./telay --upstream http://127.0.0.1:3080/
```

Omit `--upstream` to enter the URL interactively. See `telay --help` for all options. Keep the printed pairing address private.

Build and check with Go 1.27.2+:

```sh
go test -race ./...
GOOS=linux GOARCH=arm64 go build -o telay .
```

GitHub Releases provides executables, checksums, and third-party license files as separate downloads. The notice source is `../THIRD_PARTY_NOTICES.txt`.
