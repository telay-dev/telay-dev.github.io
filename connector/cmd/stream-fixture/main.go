// Isolated transport fixture; it does not access models, user devices, or production services.
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"
)

func main() {
	var mu sync.Mutex
	state := map[string]int{}
	bump := func(key string) { mu.Lock(); state[key]++; mu.Unlock() }
	http.HandleFunc("/state", func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		json.NewEncoder(w).Encode(state)
	})
	http.HandleFunc("/asset", func(w http.ResponseWriter, r *http.Request) {
		bump("asset")
		w.Header().Set("Cache-Control", "private, max-age=600")
		w.Header().Set("ETag", `"v1"`)
		fmt.Fprint(w, "cached value")
	})
	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		s, err := websocket.Accept(w, r, &websocket.AcceptOptions{Subprotocols: []string{"test"}})
		if err != nil {
			return
		}
		defer s.CloseNow()
		for {
			kind, body, err := s.Read(r.Context())
			if err != nil {
				return
			}
			bump("ws")
			if s.Write(r.Context(), kind, body) != nil {
				return
			}
		}
	})
	stream := func(w http.ResponseWriter, r *http.Request) {
		bump("events")
		defer bump("closed")
		w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		if r.URL.Path == "/post-stream" {
			body, _ := io.ReadAll(io.LimitReader(r.Body, 1024))
			fmt.Fprintf(w, "data: %s\n\n", body)
			w.(http.Flusher).Flush()
		}
		if r.URL.Query().Has("reconnect") {
			if r.Header.Get("Last-Event-ID") == "1" {
				bump("resumed")
				fmt.Fprint(w, "id: 2\ndata: resumed\n\n")
				w.(http.Flusher).Flush()
				<-r.Context().Done()
				return
			}
			fmt.Fprint(w, "retry: 150\nid: 1\ndata: first\n\n")
			w.(http.Flusher).Flush()
			return
		}
		for i := 1; ; i++ {
			fmt.Fprintf(w, "id: %d\ndata: message-%d\n\n", i, i)
			w.(http.Flusher).Flush()
			select {
			case <-r.Context().Done():
				return
			case <-time.After(150 * time.Millisecond):
			}
		}
	}
	http.HandleFunc("/events", stream)
	http.HandleFunc("/post-stream", stream)
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html;charset=utf-8")
		fmt.Fprint(w, `<!doctype html><html><head><title>Streaming fixture</title></head><body><p>HTTP / WebSocket / SSE fixture</p></body></html>`)
	})
	log.Print("Streaming fixture listening on 127.0.0.1:3101")
	log.Fatal(http.ListenAndServe("127.0.0.1:3101", nil))
}
