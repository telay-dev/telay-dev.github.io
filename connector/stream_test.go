package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func testBridge(t *testing.T, handler http.HandlerFunc) (*json.Encoder, *json.Decoder, net.Conn) {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	u, _ := url.Parse(srv.URL)
	client := srv.Client()
	client.Timeout = 30 * time.Millisecond // SSE must bypass the ordinary total timeout.
	a, c := net.Pipe()
	t.Cleanup(func() { c.Close() })
	go (&Bridge{upstream: u, client: client}).Serve(a)
	c.SetDeadline(time.Now().Add(5 * time.Second))
	return json.NewEncoder(c), json.NewDecoder(c), c
}

func readFrame(t *testing.T, decoder *json.Decoder) Frame {
	t.Helper()
	var f Frame
	if err := decoder.Decode(&f); err != nil {
		t.Fatal(err)
	}
	return f
}

func TestPingReportsHostname(t *testing.T) {
	encoder, decoder, _ := testBridge(t, func(http.ResponseWriter, *http.Request) {})
	if err := encoder.Encode(Frame{ID: 1, Op: "ping"}); err != nil {
		t.Fatal(err)
	}
	hostname, err := os.Hostname()
	if err != nil {
		t.Fatal(err)
	}
	if pong := readFrame(t, decoder); pong.Op != "pong" || pong.Hostname != hostname {
		t.Fatalf("unexpected hostname in pong: %+v", pong)
	}
}

func TestSSEStreamingCancellationAndParallelHTTP(t *testing.T) {
	cancelled := make(chan struct{})
	encoder, decoder, c := testBridge(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/asset" {
			w.Header().Set("Cache-Control", "max-age=60")
			w.Write([]byte("asset"))
			return
		}
		if r.Header.Get("Last-Event-ID") != "42" || r.Method != "POST" {
			t.Error("SSE request metadata lost")
		}
		w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		fmt.Fprint(w, "id: 43\nevent: token\ndata: event-one\n\n")
		w.(http.Flusher).Flush()
		<-r.Context().Done()
		close(cancelled)
	})
	encoder.Encode(Frame{ID: 1, Op: "http", Path: "/events", Method: "POST", Headers: map[string]string{"Last-Event-ID": "42"}, Stream: true})
	head := readFrame(t, decoder)
	if head.Op != "http-head" || head.Headers["Content-Type"] != "text/event-stream; charset=utf-8" {
		t.Fatalf("missing immediate headers: %+v", head)
	}
	// Do not forward body data without a pull; another HTTP request or ping can still respond.
	encoder.Encode(Frame{ID: 2, Op: "http", Path: "/asset", Method: "GET", Stream: true})
	asset := readFrame(t, decoder)
	if asset.ID != 2 || string(asset.Body) != "asset" {
		t.Fatalf("SSE blocked parallel HTTP: %+v", asset)
	}
	time.Sleep(60 * time.Millisecond)
	encoder.Encode(Frame{ID: 3, Op: "ping"})
	if pong := readFrame(t, decoder); pong.Op != "pong" || len(pong.Capabilities) != 2 {
		t.Fatal("missing capabilities")
	}
	encoder.Encode(Frame{ID: 1, Op: "http-pull"})
	data := readFrame(t, decoder)
	if data.Op != "http-data" || !bytes.Contains(data.Body, []byte("event-one")) {
		t.Fatalf("missing streamed body after client timeout: %+v", data)
	}
	encoder.Encode(Frame{ID: 1, Op: "http-cancel"})
	if f := readFrame(t, decoder); f.Op != "http-error" {
		t.Fatalf("missing cancellation frame: %+v", f)
	}
	select {
	case <-cancelled:
	case <-time.After(time.Second):
		t.Fatal("upstream not cancelled")
	}
	c.Close()
}

func TestSSEChunkOrderAndEOF(t *testing.T) {
	payload := bytes.Repeat([]byte("data: abcdefghijklmnopqrstuvwxyz\n\n"), 4000)
	encoder, decoder, _ := testBridge(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.Write(payload)
	})
	encoder.Encode(Frame{ID: 1, Op: "http", Path: "/events", Method: "GET", Stream: true})
	if f := readFrame(t, decoder); f.Op != "http-head" {
		t.Fatal("expected headers")
	}
	var received []byte
	for {
		encoder.Encode(Frame{ID: 1, Op: "http-pull"})
		f := readFrame(t, decoder)
		if f.Op == "http-end" {
			break
		}
		if f.Op != "http-data" || len(f.Body) > streamChunk {
			t.Fatalf("invalid chunk: %s %d", f.Op, len(f.Body))
		}
		received = append(received, f.Body...)
	}
	if !bytes.Equal(received, payload) {
		t.Fatal("stream lost/reordered data")
	}
}

func TestSSECancelBeforeHeadersAndDisconnect(t *testing.T) {
	for _, disconnect := range []bool{false, true} {
		t.Run(fmt.Sprint(disconnect), func(t *testing.T) {
			started, cancelled := make(chan struct{}), make(chan struct{})
			encoder, decoder, c := testBridge(t, func(w http.ResponseWriter, r *http.Request) {
				close(started)
				<-r.Context().Done()
				close(cancelled)
			})
			encoder.Encode(Frame{ID: 1, Op: "http", Path: "/events", Method: "GET", Stream: true})
			<-started
			if disconnect {
				c.Close()
			} else {
				encoder.Encode(Frame{ID: 1, Op: "http-cancel"})
				if f := readFrame(t, decoder); f.Error == "" {
					t.Fatal("cancel should fail pending response")
				}
			}
			select {
			case <-cancelled:
			case <-time.After(time.Second):
				t.Fatal("upstream leaked")
			}
		})
	}
}

func TestWebSocketTextBinaryAndSubprotocol(t *testing.T) {
	encoder, decoder, _ := testBridge(t, func(w http.ResponseWriter, r *http.Request) {
		ws, err := websocket.Accept(w, r, &websocket.AcceptOptions{Subprotocols: []string{"relay-test"}})
		if err != nil {
			return
		}
		defer ws.CloseNow()
		for {
			kind, body, err := ws.Read(r.Context())
			if err != nil {
				return
			}
			if ws.Write(context.Background(), kind, body) != nil {
				return
			}
		}
	})
	encoder.Encode(Frame{ID: 1, Op: "ws-open", Path: "/ws", Protocols: []string{"relay-test"}})
	if f := readFrame(t, decoder); f.Op != "ws-opened" || f.Protocol != "relay-test" {
		t.Fatalf("WS open failed: %+v", f)
	}
	for _, message := range []Frame{{Type: 1, Body: []byte("café 🌱")}, {Type: 2, Body: []byte{0, 255, 1, 128}}} {
		message.ID, message.Op = 1, "ws-send"
		encoder.Encode(message)
		f := readFrame(t, decoder)
		if f.Op != "ws-data" || f.Type != message.Type || !bytes.Equal(f.Body, message.Body) {
			t.Fatalf("WS round trip failed: %+v", f)
		}
	}
	encoder.Encode(Frame{ID: 1, Op: "ws-close"})
	if f := readFrame(t, decoder); f.Op != "ws-closed" {
		t.Fatal("WS close failed")
	}
}
