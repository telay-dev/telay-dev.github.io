package main

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"
)

func TestUpstreamValidation(t *testing.T) {
	for _, raw := range []string{"http://example.com/", "http://localhost/", "http://0.0.0.0/", "http://169.254.169.254/", "https://127.0.0.1/", "http://127.0.0.1/foo", "http://a:b@127.0.0.1/"} {
		if _, err := validateUpstream(raw); err == nil {
			t.Errorf("accepted %s", raw)
		}
	}
	for _, raw := range []string{"http://127.0.0.1:3080/?token=secret", "http://[::1]:3080/"} {
		if _, err := validateUpstream(raw); err != nil {
			t.Fatal(err)
		}
	}
}

func TestResponseCompression(t *testing.T) {
	payload := bytes.Repeat([]byte("native-dsh-javascript "), 10000)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.Write(payload) }))
	defer srv.Close()
	u, _ := url.Parse(srv.URL)
	b := &Bridge{upstream: u, client: srv.Client()}
	r := b.request(context.Background(), Frame{Path: "/assets/app.js", Method: "GET"})
	if r.Encoding != "gzip" || len(r.Body) >= len(payload) {
		t.Fatal("expected compression")
	}
	zr, err := gzip.NewReader(bytes.NewReader(r.Body))
	if err != nil {
		t.Fatal(err)
	}
	defer zr.Close()
	raw, _ := io.ReadAll(zr)
	if !bytes.Equal(raw, payload) {
		t.Fatal("gzip roundtrip mismatch")
	}
}
func TestPathValidation(t *testing.T) {
	u, _ := url.Parse("http://127.0.0.1:3080/")
	for _, path := range []string{"https://evil.com/", "//evil.com/", "/api/../connect", "/%2e%2e/connect", "/connect", "/?token=secret", "/foo\\bar"} {
		if _, err := requestURL(u, path); err == nil {
			t.Errorf("accepted %s", path)
		}
	}
	if out, err := requestURL(u, "/api/foo?q=1"); err != nil || out.String() != "http://127.0.0.1:3080/api/foo?q=1" {
		t.Fatalf("bad path: %v %v", out, err)
	}
}
func TestHTTPTrustAndAuthentication(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("dsh-test")
		if err != nil || cookie.Value != "secret" {
			t.Error("missing local cookie")
		}
		if r.Header.Get("Origin") != "http://"+r.Host {
			t.Error("origin trust mismatch")
		}
		if r.Header.Get("Authorization") != "" {
			t.Error("forwarded unsafe authorization")
		}
		http.SetCookie(w, &http.Cookie{Name: "other-secret", Value: "hidden"})
		w.Header().Set("Content-Type", "text/plain")
		w.Write([]byte("real upstream"))
	}))
	defer srv.Close()
	u, _ := url.Parse(srv.URL)
	jar, _ := cookiejar.New(nil)
	jar.SetCookies(u, []*http.Cookie{{Name: "dsh-test", Value: "secret"}})
	b := &Bridge{upstream: u, client: &http.Client{Jar: jar}}
	result := b.request(context.Background(), Frame{Path: "/api/check", Method: "POST", Headers: map[string]string{"Authorization": "evil"}})
	if result.Status != 200 || string(result.Body) != "real upstream" || result.Headers["Set-Cookie"] != "" {
		t.Fatalf("bad response: %+v", result)
	}
}
func TestProbeProtocol(t *testing.T) {
	a, b := net.Pipe()
	defer b.Close()
	go (&Bridge{}).Serve(a)
	b.SetDeadline(time.Now().Add(3 * time.Second))
	json.NewEncoder(b).Encode(Frame{ID: 1, Op: "probe", Size: 1024})
	var result Frame
	if err := json.NewDecoder(b).Decode(&result); err != nil {
		t.Fatal(err)
	}
	if len(result.Body) != 1024 || result.Body[255] != byte(255%251) {
		t.Fatal("probe mismatch")
	}
}
