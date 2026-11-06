package main

import (
	"context"
	"io"
	"mime"
	"sync"
	"time"
)

const streamChunk = 32 << 10
const maxHTTPStreams = 16

type httpStream struct {
	cancel context.CancelFunc
	pull   chan struct{}
}

type httpStreams struct {
	mu     sync.Mutex
	active map[int]*httpStream
}

func newHTTPStreams() *httpStreams { return &httpStreams{active: make(map[int]*httpStream)} }

func (s *httpStreams) close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, stream := range s.active {
		stream.cancel()
	}
}

func (s *httpStreams) control(f Frame) {
	s.mu.Lock()
	stream := s.active[f.ID]
	s.mu.Unlock()
	if stream == nil {
		return
	}
	if f.Op == "http-cancel" {
		stream.cancel()
		return
	}
	// 单块信用。重复 pull 不会创建无界队列。
	select {
	case stream.pull <- struct{}{}:
	default:
	}
}

func (s *httpStreams) start(parent context.Context, b *Bridge, f Frame, send func(Frame)) {
	ctx, cancel := context.WithCancel(parent)
	stream := &httpStream{cancel: cancel, pull: make(chan struct{}, 1)}
	s.mu.Lock()
	if _, exists := s.active[f.ID]; exists || len(s.active) >= maxHTTPStreams {
		s.mu.Unlock()
		cancel()
		send(Frame{ID: f.ID, Op: "result", Error: "HTTP 连接数量超限"})
		return
	}
	s.active[f.ID] = stream
	s.mu.Unlock()
	go func() {
		defer cancel()
		defer func() { s.mu.Lock(); delete(s.active, f.ID); s.mu.Unlock() }()
		// 首部 90 秒；非流式正文继续使用有界总时限。
		timer := time.AfterFunc(90*time.Second, cancel)
		defer timer.Stop()
		resp, err := b.openHTTP(ctx, f, true)
		if err != nil {
			send(Frame{ID: f.ID, Op: "result", Error: err.Error()})
			return
		}
		defer resp.Body.Close()
		contentType, _, _ := mime.ParseMediaType(resp.Header.Get("Content-Type"))
		if contentType != "text/event-stream" || f.Method == "HEAD" || resp.StatusCode == 204 || resp.StatusCode == 205 || resp.StatusCode == 304 {
			result := bufferedHTTP(resp)
			result.ID, result.Op = f.ID, "result"
			send(result)
			return
		}
		timer.Stop()
		send(Frame{ID: f.ID, Op: "http-head", Status: resp.StatusCode, Headers: responseHeaders(resp)})
		buffer := make([]byte, streamChunk)
		for {
			select {
			case <-ctx.Done():
				send(Frame{ID: f.ID, Op: "http-error", Error: "事件流已取消或连接中断"})
				return
			case <-stream.pull:
			}
			n, err := resp.Body.Read(buffer)
			if n > 0 {
				send(Frame{ID: f.ID, Op: "http-data", Body: buffer[:n]})
			}
			if err != nil {
				if err == io.EOF {
					send(Frame{ID: f.ID, Op: "http-end"})
				} else {
					send(Frame{ID: f.ID, Op: "http-error", Error: "上游事件流读取失败"})
				}
				return
			}
		}
	}()
}
