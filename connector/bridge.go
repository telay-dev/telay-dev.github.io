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
	Capabilities []string          `json:"capabilities,omitempty"`
}
type Bridge struct {
	upstream *url.URL
	client   *http.Client
	profile  string
	directMu sync.Mutex
	direct   *directSession
}

func (b *Bridge) Serve(c net.Conn) {
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
				send(Frame{ID: f.ID, Op: "result", Error: "直连协商失败"})
			} else {
				send(Frame{ID: f.ID, Op: "result", SDP: answer})
			}
		case "ping":
			send(Frame{ID: f.ID, Op: "pong", Capabilities: []string{"http-stream-v1", "http-cache-v1"}})
		case "probe":
			if f.Size < 1 || f.Size > 1<<20 {
				send(Frame{ID: f.ID, Op: "result", Error: "测速单次限 1 MiB"})
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
				send(Frame{ID: f.ID, Op: "result", Error: "请求过多，请稍后重试"})
				continue
			}
		case "http-pull", "http-cancel":
			streams.control(f)
		case "ws-open":
			if b.upstream == nil {
				send(Frame{ID: f.ID, Op: "ws-error", Error: "未设置本机上游"})
				continue
			}
			if _, err := b.targetURL(f.Path); err != nil {
				send(Frame{ID: f.ID, Op: "ws-error", Error: err.Error()})
				continue
			}
			socketMu.Lock()
			if _, exists := sockets[f.ID]; exists || len(sockets) >= 4 {
				socketMu.Unlock()
				send(Frame{ID: f.ID, Op: "ws-error", Error: "WebSocket 数量超限"})
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
					send(Frame{ID: f.ID, Op: "ws-error", Error: "上游 WebSocket 连接或认证失败"})
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
					send(Frame{ID: f.ID, Op: "ws-data", Type: int(typ), Body: data})
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
			send(Frame{ID: f.ID, Op: "result", Error: "未知协议操作"})
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
		return nil, fmt.Errorf("当前是仅测速模式，未连接本机服务")
	}
	u, err := b.targetURL(f.Path)
	if err != nil {
		return nil, err
	}
	if f.Method != "GET" && f.Method != "HEAD" && f.Method != "POST" && f.Method != "PUT" && f.Method != "PATCH" && f.Method != "DELETE" && f.Method != "OPTIONS" {
		return nil, fmt.Errorf("不支持的请求方法")
	}
	if len(f.Body) > maxBody {
		return nil, fmt.Errorf("试用版附件上限 32 MiB")
	}
	req, err := http.NewRequestWithContext(ctx, f.Method, u.String(), bytes.NewReader(f.Body))
	if err != nil {
		return nil, fmt.Errorf("请求无效")
	}
	for k, v := range f.Headers {
		switch strings.ToLower(k) {
		case "content-type", "accept", "accept-language", "range", "x-csrf-token", "x-xsrf-token", "cache-control", "pragma", "if-none-match", "if-modified-since", "if-match", "if-unmodified-since", "if-range", "last-event-id":
			req.Header.Set(k, v)
		}
	}
	req.Header.Set("Origin", b.upstream.Scheme+"://"+b.upstream.Host)
	client := *b.client
	if streaming {
		// 流的寿命由请求取消或隧道断开决定，不沿用普通 HTTP 的总时限。
		client.Timeout = 0
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("本机上游请求失败")
	}
	return resp, nil
}

func bufferedHTTP(resp *http.Response) Frame {
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxBody+1))
	if err != nil || len(body) > maxBody {
		return Frame{Error: "响应超过试用版 32 MiB 上限"}
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
		return nil, fmt.Errorf("拒绝非 DSH 相对请求或远程 token 交换")
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
		return nil, fmt.Errorf("拒绝跨主机或不安全路径")
	}
	u := *b.upstream
	u.Path = p.Path
	u.RawPath = p.RawPath
	u.RawQuery = p.RawQuery
	u.Fragment = ""
	return &u, nil
}
