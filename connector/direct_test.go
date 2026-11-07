package main

import (
	"bytes"
	"context"
	"encoding/json"
	"github.com/coder/websocket"
	"github.com/pion/webrtc/v4"
	"math/rand"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestGenericHTTPAndWebSocket(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/echo" {
			conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{Subprotocols: []string{"echo.v1"}})
			if err != nil {
				return
			}
			defer conn.CloseNow()
			typ, msg, err := conn.Read(r.Context())
			if err == nil {
				conn.Write(r.Context(), typ, append([]byte(r.URL.RawQuery+":"), msg...))
			}
			return
		}
		w.Write([]byte(r.Method + ":" + r.URL.RawQuery))
	}))
	defer srv.Close()
	u, _ := url.Parse(srv.URL)
	bridge := &Bridge{upstream: u, client: srv.Client()}
	result := bridge.request(context.Background(), Frame{Path: "/thing?token=app-token", Method: "PATCH"})
	if result.Status != 200 || string(result.Body) != "PATCH:token=app-token" {
		t.Fatalf("generic HTTP failed: %+v", result)
	}
	if _, err := (&Bridge{upstream: u, profile: "dsh"}).targetURL("/?token=secret"); err == nil {
		t.Fatal("DSH profile must protect launch authentication")
	}
	for _, path := range []string{"//evil.test/", "https://evil.test/", "/%2e%2e/private"} {
		if _, err := bridge.targetURL(path); err == nil {
			t.Fatal("unsafe generic path accepted")
		}
	}
	a, b := net.Pipe()
	defer b.Close()
	b.SetDeadline(time.Now().Add(5 * time.Second))
	go bridge.Serve(a)
	enc, dec := json.NewEncoder(b), json.NewDecoder(b)
	enc.Encode(Frame{ID: 1, Op: "ws-open", Path: "/echo?tag=local", Protocols: []string{"echo.v1"}})
	var f Frame
	if err := dec.Decode(&f); err != nil || f.Op != "ws-opened" || f.Protocol != "echo.v1" {
		t.Fatalf("generic socket open: %+v %v", f, err)
	}
	enc.Encode(Frame{ID: 1, Op: "ws-send", Type: 1, Body: []byte("hello")})
	if err := dec.Decode(&f); err != nil || f.Op != "ws-data" || string(f.Body) != "tag=local:hello" {
		t.Fatalf("generic socket echo: %+v %v", f, err)
	}
}

func TestLocalDirectCarriesHTTPWithoutRelay(t *testing.T) {
	large := make([]byte, 512<<10)
	rand.New(rand.NewSource(42)).Read(large)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		if r.URL.Path == "/large" {
			w.Write(large)
			return
		}
		w.Write([]byte("direct-http-ok"))
	}))
	defer srv.Close()
	u, _ := url.Parse(srv.URL)
	bridge := &Bridge{upstream: u, client: srv.Client()}
	defer bridge.closeDirect()
	var settings webrtc.SettingEngine
	settings.SetIncludeLoopbackCandidate(true)
	settings.SetIPFilter(func(ip net.IP) bool { return ip.IsLoopback() })
	peer, err := webrtc.NewAPI(webrtc.WithSettingEngine(settings)).NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		t.Fatal(err)
	}
	defer peer.Close()
	dc, err := peer.CreateDataChannel("relay-v1", nil)
	if err != nil {
		t.Fatal(err)
	}
	opened := make(chan struct{})
	dc.OnOpen(func() { close(opened) })
	results := make(chan Frame, 64)
	var mu sync.Mutex
	buffer := ""
	dc.OnMessage(func(message webrtc.DataChannelMessage) {
		mu.Lock()
		defer mu.Unlock()
		buffer += string(message.Data)
		for {
			end := strings.IndexByte(buffer, '\n')
			if end < 0 {
				return
			}
			var f Frame
			if json.Unmarshal([]byte(buffer[:end]), &f) == nil {
				results <- f
			}
			buffer = buffer[end+1:]
		}
	})
	offer, err := peer.CreateOffer(nil)
	if err != nil {
		t.Fatal(err)
	}
	gathered := webrtc.GatheringCompletePromise(peer)
	if err = peer.SetLocalDescription(offer); err != nil {
		t.Fatal(err)
	}
	select {
	case <-gathered:
	case <-time.After(5 * time.Second):
		t.Fatal("local gathering timeout")
	}
	answer, err := bridge.offerDirect(peer.LocalDescription().SDP)
	if err != nil {
		t.Fatal(err)
	}
	if err = peer.SetRemoteDescription(webrtc.SessionDescription{Type: webrtc.SDPTypeAnswer, SDP: answer}); err != nil {
		t.Fatal(err)
	}
	select {
	case <-opened:
	case <-time.After(10 * time.Second):
		t.Fatal("local direct connection timeout")
	}
	payload, _ := json.Marshal(Frame{ID: 2, Op: "http", Path: "/test", Method: "GET"})
	if err = dc.Send(append(payload, '\n')); err != nil {
		t.Fatal(err)
	}
	select {
	case f := <-results:
		if f.ID != 2 || f.Status != 200 || string(f.Body) != "direct-http-ok" {
			t.Fatalf("direct HTTP failed: %+v", f)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("direct HTTP timeout")
	}
	payload, _ = json.Marshal(Frame{ID: 3, Op: "http", Path: "/large", Method: "GET", Stream: true, Chunked: true})
	if err = dc.Send(append(payload, '\n')); err != nil {
		t.Fatal(err)
	}
	var received []byte
	deadline := time.After(10 * time.Second)
	for {
		select {
		case f := <-results:
			switch f.Op {
			case "result-part":
				received = append(received, f.Body...)
			case "result-end":
				if !bytes.Equal(received, large) {
					t.Fatal("direct chunked response changed")
				}
				return
			case "result-head":
			default:
				t.Fatalf("unexpected response: %+v", f)
			}
		case <-deadline:
			t.Fatal("direct chunked HTTP timeout")
		}
	}
}
