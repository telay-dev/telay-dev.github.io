package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
)

func TestHTTPCacheHeaders(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Accept-Language") != "en" {
			t.Error("Accept-Language not forwarded")
		}
		w.Header().Set("Cache-Control", "private, max-age=0")
		w.Header().Set("ETag", `"v1"`)
		w.Header().Set("Last-Modified", "Tue, 03 Nov 2026 00:00:00 GMT")
		w.Header().Set("Expires", "Tue, 03 Nov 2026 00:00:00 GMT")
		w.Header().Set("Vary", "Accept-Language")
		w.Header().Set("Age", "3")
		if r.Header.Get("If-None-Match") == `"v1"` {
			w.WriteHeader(http.StatusNotModified)
			return
		}
		w.Write([]byte("cache body"))
	}))
	defer srv.Close()
	u, _ := url.Parse(srv.URL)
	b := &Bridge{upstream: u, client: srv.Client()}
	first := b.request(context.Background(), Frame{Path: "/asset", Method: "GET", Headers: map[string]string{"Accept-Language": "en"}})
	for _, key := range []string{"Cache-Control", "ETag", "Last-Modified", "Expires", "Vary", "Age", "Date"} {
		if first.Headers[key] == "" {
			t.Errorf("missing response header %s", key)
		}
	}
	second := b.request(context.Background(), Frame{Path: "/asset", Method: "GET", Headers: map[string]string{"Accept-Language": "en", "If-None-Match": `"v1"`}})
	if second.Status != 304 || len(second.Body) != 0 || second.Headers["ETag"] != `"v1"` {
		t.Fatalf("invalid conditional response: %d", second.Status)
	}
}
