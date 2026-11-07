package main

import (
	"bufio"
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
)

const maxBody = 32 << 20

type Frame struct {
	ID           int               `json:"id"`
	Op           string            `json:"op"`
	Path         string            `json:"path,omitempty"`
	Method       string            `json:"method,omitempty"`
	Headers      map[string]string `json:"headers,omitempty"`
	Body         []byte            `json:"body,omitempty"`
	Status       int               `json:"status,omitempty"`
	Error        string            `json:"error,omitempty"`
	Type         int               `json:"type,omitempty"`
	Size         int               `json:"size,omitempty"`
	MS           float64           `json:"ms,omitempty"`
	Encoding     string            `json:"encoding,omitempty"`
	Protocols    []string          `json:"protocols,omitempty"`
	Protocol     string            `json:"protocol,omitempty"`
	SDP          string            `json:"sdp,omitempty"`
	Stream       bool              `json:"stream,omitempty"`
	Chunked      bool              `json:"chunked,omitempty"`
	Capabilities []string          `json:"capabilities,omitempty"`
	Hostname     string            `json:"hostname,omitempty"`
}
type Bridge struct {
	upstream *url.URL
	client   *http.Client
	profile  string
	directMu sync.Mutex
	direct   *directSession
}

func (b *Bridge) Serve(c net.Conn) {
	hostname, _ := os.Hostname()
	defer c.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var writeMu sync.Mutex
	send := func(f Frame) {
		writeMu.Lock()
		defer writeMu.Unlock()
		c.SetWriteDeadline(time.Now().Add(90 * time.Second))
		if json.NewEncoder(c).Encode(f) != nil {
			cancel()
			c.Close()
		}
	}
	var socketMu sync.Mutex
	sockets := map[int]*websocket.Conn{}
	defer func() {
		socketMu.Lock()
		defer socketMu.Unlock()
		for _, s := range sockets {
			if s != nil {
				s.CloseNow()
			}
		}
	}()
	jobs := make(chan Frame, 64)
	streams := newHTTPStreams()
	defer streams.close()
	for i := 0; i < 6; i++ {
		go func() {
			for {
				select {
				case <-ctx.Done():
					return
				case f := <-jobs:
					start := time.Now()
					out := b.request(ctx, f)
					out.ID = f.ID
					out.Op = "result"
					out.MS = float64(time.Since(start).Milliseconds())
					send(out)
				}
			}
		}()
	}
	scan := bufio.NewScanner(c)
	scan.Buffer(make([]byte, 4096), 46<<20)
	for scan.Scan() {
		var f Frame
		if json.Unmarshal(scan.Bytes(), &f) != nil || f.ID < 1 {
			break
		}
		switch f.Op {
		case "direct-offer":
			answer, err := b.offerDirect(f.SDP)
			if err != nil {
				send(Frame{ID: f.ID, Op: "result", Error: "direct connection negotiation failed"})
			} else {
				send(Frame{ID: f.ID, Op: "result", SDP: answer})
			}
		case "ping":
			send(Frame{ID: f.ID, Op: "pong", Capabilities: []string{"http-stream-v1", "http-cache-v1", "http-chunks-v1", "ws-chunks-v1"}, Hostname: hostname})
		case "probe":
			if f.Size < 1 || f.Size > 1<<20 {
				send(Frame{ID: f.ID, Op: "result", Error: "bandwidth probes are limited to 1 MiB per request"})
				continue
			}
			body := make([]byte, f.Size)
			for i := range body {
				body[i] = byte(i % 251)
			}
			send(Frame{ID: f.ID, Op: "result", Body: body})
		case "http":
			if f.Stream {
				streams.start(ctx, b, f, send)
				continue
			}
			select {
			case jobs <- f:
			default:
				send(Frame{ID: f.ID, Op: "result", Error: "too many requests; try again later"})
				continue
			}
		case "http-pull", "http-cancel":
			streams.control(f)
		case "ws-open":
			if b.upstream == nil {
				send(Frame{ID: f.ID, Op: "ws-error", Error: "local upstream is not configured"})
				continue
			}
			if _, err := b.targetURL(f.Path); err != nil {
				send(Frame{ID: f.ID, Op: "ws-error", Error: err.Error()})
				continue
			}
			socketMu.Lock()
			if _, exists := sockets[f.ID]; exists || len(sockets) >= 4 {
				socketMu.Unlock()
				send(Frame{ID: f.ID, Op: "ws-error", Error: "too many concurrent WebSocket connections"})
				continue
			}
			sockets[f.ID] = nil
			socketMu.Unlock()
			go func(f Frame) {
				u, _ := b.targetURL(f.Path)
				u.Scheme = "ws"
				h := http.Header{"Origin": {b.upstream.Scheme + "://" + b.upstream.Host}}
				if b.client.Jar != nil {
					for _, cookie := range b.client.Jar.Cookies(b.upstream) {
						h.Add("Cookie", cookie.String())
					}
				}
				dialctx, stop := context.WithTimeout(ctx, 15*time.Second)
				s, _, err := websocket.Dial(dialctx, u.String(), &websocket.DialOptions{HTTPHeader: h, HTTPClient: b.client, Subprotocols: f.Protocols})
				stop()
				if err != nil {
					socketMu.Lock()
					delete(sockets, f.ID)
					socketMu.Unlock()
					send(Frame{ID: f.ID, Op: "ws-error", Error: "upstream WebSocket connection or authentication failed"})
					return
				}
				s.SetReadLimit(maxBody)
				socketMu.Lock()
				sockets[f.ID] = s
				socketMu.Unlock()
				defer func() { s.CloseNow(); socketMu.Lock(); delete(sockets, f.ID); socketMu.Unlock() }()
				send(Frame{ID: f.ID, Op: "ws-opened", Protocol: s.Subprotocol()})
				for {
					typ, data, err := s.Read(ctx)
					if err != nil {
						send(Frame{ID: f.ID, Op: "ws-closed"})
						return
					}
					if f.Chunked && len(data) > resultChunk {
						send(Frame{ID: f.ID, Op: "ws-data-head", Type: int(typ)})
						for len(data) > 0 {
							n := min(len(data), resultChunk)
							send(Frame{ID: f.ID, Op: "ws-data-part", Body: data[:n]})
							data = data[n:]
						}
						send(Frame{ID: f.ID, Op: "ws-data-end"})
					} else {
						send(Frame{ID: f.ID, Op: "ws-data", Type: int(typ), Body: data})
					}
				}
			}(f)
		case "ws-send", "ws-close":
			socketMu.Lock()
			s := sockets[f.ID]
			socketMu.Unlock()
			if s == nil {
				continue
			}
			if f.Op == "ws-close" {
				s.CloseNow()
				continue
			}
			if len(f.Body) > maxBody || (f.Type != 1 && f.Type != 2) {
				s.CloseNow()
				continue
			}
			writeCtx, stop := context.WithTimeout(ctx, 30*time.Second)
			s.Write(writeCtx, websocket.MessageType(f.Type), f.Body)
			stop()
		default:
			send(Frame{ID: f.ID, Op: "result", Error: "unknown protocol operation"})
		}
	}
}

func (b *Bridge) request(ctx context.Context, f Frame) Frame {
	resp, err := b.openHTTP(ctx, f, false)
	if err != nil {
		return Frame{Error: err.Error()}
	}
	defer resp.Body.Close()
	return bufferedHTTP(resp)
}

func (b *Bridge) openHTTP(ctx context.Context, f Frame, streaming bool) (*http.Response, error) {
	if b.upstream == nil {
		return nil, fmt.Errorf("bandwidth-probe mode is active; no local service is connected")
	}
	u, err := b.targetURL(f.Path)
	if err != nil {
		return nil, err
	}
	if f.Method != "GET" && f.Method != "HEAD" && f.Method != "POST" && f.Method != "PUT" && f.Method != "PATCH" && f.Method != "DELETE" && f.Method != "OPTIONS" {
		return nil, fmt.Errorf("unsupported request method")
	}
	if len(f.Body) > maxBody {
		return nil, fmt.Errorf("request body exceeds the 32 MiB limit")
	}
	req, err := http.NewRequestWithContext(ctx, f.Method, u.String(), bytes.NewReader(f.Body))
	if err != nil {
		return nil, fmt.Errorf("invalid request")
	}
	for k, v := range f.Headers {
		switch strings.ToLower(k) {
		case "host", "origin", "cookie", "connection", "proxy-connection", "keep-alive", "transfer-encoding", "te", "trailer", "upgrade", "content-length", "accept-encoding":
			continue
		}
		req.Header.Set(k, v)
	}
	req.Header.Set("Origin", b.upstream.Scheme+"://"+b.upstream.Host)
	client := *b.client
	if streaming {
		// Streaming requests end on cancellation or tunnel closure, not the ordinary HTTP timeout.
		client.Timeout = 0
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("local upstream request failed")
	}
	return resp, nil
}

func bufferedHTTP(resp *http.Response) Frame {
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxBody+1))
	if err != nil || len(body) > maxBody {
		return Frame{Error: "response exceeds the 32 MiB limit"}
	}
	headers := responseHeaders(resp)
	encoding := ""
	if len(body) > 1024 {
		var compressed bytes.Buffer
		zw, _ := gzip.NewWriterLevel(&compressed, gzip.BestSpeed)
		zw.Write(body)
		zw.Close()
		if compressed.Len() < len(body)*9/10 {
			body = compressed.Bytes()
			encoding = "gzip"
		}
	}
	return Frame{Status: resp.StatusCode, Headers: headers, Body: body, Encoding: encoding}
}

func responseHeaders(resp *http.Response) map[string]string {
	headers := map[string]string{}
	for _, k := range []string{"Content-Type", "Content-Disposition", "Cache-Control", "Content-Range", "Accept-Ranges", "ETag", "Last-Modified", "Expires", "Date", "Age", "Vary", "Pragma"} {
		if v := resp.Header.Get(k); v != "" {
			headers[k] = v
		}
	}
	return headers
}

func requestURL(base *url.URL, path string) (*url.URL, error) {
	p, err := url.Parse(path)
	if err != nil || p.IsAbs() || p.Host != "" || !strings.HasPrefix(path, "/") || strings.HasPrefix(path, "//") || strings.Contains(p.Path, "..") || strings.Contains(p.Path, "\\") || p.Path == "/connect" || p.Query().Has("token") {
		return nil, fmt.Errorf("only DSH-relative requests are allowed; remote token exchange is blocked")
	}
	u := *base
	u.Path = p.Path
	u.RawPath = p.RawPath
	u.RawQuery = p.RawQuery
	u.Fragment = ""
	return &u, nil
}

func (b *Bridge) targetURL(path string) (*url.URL, error) {
	if b.profile == "dsh" {
		return requestURL(b.upstream, path)
	}
	p, err := url.Parse(path)
	if err != nil || p.IsAbs() || p.Host != "" || !strings.HasPrefix(path, "/") || strings.HasPrefix(path, "//") || strings.Contains(p.Path, "..") || strings.Contains(p.Path, "\\") {
		return nil, fmt.Errorf("cross-host requests and unsafe paths are not allowed")
	}
	u := *b.upstream
	u.Path = p.Path
	u.RawPath = p.RawPath
	u.RawQuery = p.RawQuery
	u.Fragment = ""
	return &u, nil
}
