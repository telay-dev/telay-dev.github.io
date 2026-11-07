package main

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func TestWebSocketHeartbeatDuringBlockedTunnel(t *testing.T) {
	for _, blockOpen := range []bool{false, true} {
		t.Run(fmt.Sprintf("block-open=%v", blockOpen), func(t *testing.T) {
			start := make(chan struct{})
			heartbeats := make(chan error, 1)
			closed := make(chan error, 1)
			text := bytes.Repeat([]byte("snapshot 🌱 "), 22000)
			binary := bytes.Repeat([]byte{0, 255, 128}, 14000)
			encoder, decoder, _ := testBridge(t, func(w http.ResponseWriter, r *http.Request) {
				s, err := websocket.Accept(w, r, nil)
				if err != nil {
					heartbeats <- err
					return
				}
				defer s.CloseNow()
				ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
				defer cancel()
				s.CloseRead(ctx)
				<-start
				for _, message := range []socketMessage{{websocket.MessageText, text}, {websocket.MessageBinary, binary}} {
					if err := s.Write(ctx, message.typ, message.data); err != nil {
						heartbeats <- err
						return
					}
				}
				// Require several protocol Pongs before allowing the tunnel to
				// drain. The old synchronous reader cannot answer even the first.
				for i := 0; i < 4; i++ {
					pingCtx, stop := context.WithTimeout(ctx, 250*time.Millisecond)
					err := s.Ping(pingCtx)
					stop()
					if err != nil {
						heartbeats <- err
						return
					}
				}
				heartbeats <- nil
				closed <- s.Close(websocket.StatusPolicyViolation, "test policy 🌱")
			})
			if err := encoder.Encode(Frame{ID: 1, Op: "ws-open", Path: "/ws", Chunked: true}); err != nil {
				t.Fatal(err)
			}
			if !blockOpen {
				if f := readFrame(t, decoder); f.Op != "ws-opened" {
					t.Fatalf("expected open, got %+v", f)
				}
			}
			close(start)
			select {
			case err := <-heartbeats:
				if err != nil {
					t.Fatalf("blocked tunnel stalled WebSocket heartbeat: %v", err)
				}
			case <-time.After(2 * time.Second):
				t.Fatal("heartbeat test timed out")
			}
			// The upstream close handshake must also finish while tunnel
			// writes are blocked, then its event must follow the queued data.
			select {
			case err := <-closed:
				if err != nil {
					t.Fatal(err)
				}
			case <-time.After(time.Second):
				t.Fatal("blocked tunnel stalled close handshake")
			}
			if blockOpen {
				if f := readFrame(t, decoder); f.Op != "ws-opened" {
					t.Fatalf("expected open, got %+v", f)
				}
			}
			for _, expected := range []socketMessage{{websocket.MessageText, text}, {websocket.MessageBinary, binary}} {
				head := readFrame(t, decoder)
				if head.Op != "ws-data-head" || head.Type != int(expected.typ) {
					t.Fatalf("lost message order/type: %+v", head)
				}
				var received []byte
				for {
					f := readFrame(t, decoder)
					if f.Op == "ws-data-end" {
						break
					}
					if f.Op != "ws-data-part" || len(f.Body) > resultChunk {
						t.Fatalf("unexpected frame: %s", f.Op)
					}
					received = append(received, f.Body...)
				}
				if !bytes.Equal(received, expected.data) {
					t.Fatal("WebSocket message bytes changed")
				}
			}
			f := readFrame(t, decoder)
			if f.Op != "ws-closed" || f.Code != 1008 || f.Reason != "test policy 🌱" || !f.WasClean {
				t.Fatalf("upstream close metadata lost: %+v", f)
			}
		})
	}
}

func TestWebSocketReceiveBufferLimits(t *testing.T) {
	for _, byteLimit := range []bool{false, true} {
		t.Run(fmt.Sprintf("bytes=%v", byteLimit), func(t *testing.T) {
			upstreamClosed := make(chan struct{})
			encoder, decoder, _ := testBridge(t, func(w http.ResponseWriter, r *http.Request) {
				s, err := websocket.Accept(w, r, nil)
				if err != nil {
					return
				}
				defer s.CloseNow()
				ctx := s.CloseRead(r.Context())
				if byteLimit {
					s.Write(ctx, websocket.MessageBinary, make([]byte, maxSocketQueuedBytes))
					s.Write(ctx, websocket.MessageBinary, []byte{1})
				} else {
					// Empty messages consume no byte budget but still need a bound.
					for i := 0; i <= maxSocketQueuedMessages; i++ {
						if s.Write(ctx, websocket.MessageText, nil) != nil {
							break
						}
					}
				}
				<-ctx.Done()
				close(upstreamClosed)
			})
			encoder.Encode(Frame{ID: 1, Op: "ws-open", Path: "/ws", Chunked: true})
			select {
			case <-upstreamClosed:
			case <-time.After(3 * time.Second):
				t.Fatal("overloaded socket did not close while tunnel was blocked")
			}
			if f := readFrame(t, decoder); f.Op != "ws-opened" {
				t.Fatalf("expected open: %+v", f)
			}
			messages, receivedBytes := 0, 0
			for {
				f := readFrame(t, decoder)
				if f.Op == "ws-error" {
					if f.Error != "upstream WebSocket receive buffer exceeded" {
						t.Fatalf("missing overload error: %+v", f)
					}
					break
				}
				switch f.Op {
				case "ws-data", "ws-data-end":
					messages++
				case "ws-data-head":
				case "ws-data-part":
					receivedBytes += len(f.Body)
				default:
					t.Fatalf("unexpected buffered frame: %s", f.Op)
				}
			}
			if byteLimit {
				if messages != 1 || receivedBytes != maxSocketQueuedBytes {
					t.Fatalf("accepted buffer was lost: messages=%d bytes=%d", messages, receivedBytes)
				}
			} else if messages != maxSocketQueuedMessages {
				t.Fatalf("accepted buffer was lost: messages=%d", messages)
			}
		})
	}
}

func TestWebSocketAbnormalClose(t *testing.T) {
	encoder, decoder, _ := testBridge(t, func(w http.ResponseWriter, r *http.Request) {
		s, err := websocket.Accept(w, r, nil)
		if err == nil {
			s.CloseNow()
		}
	})
	encoder.Encode(Frame{ID: 1, Op: "ws-open", Path: "/ws"})
	readFrame(t, decoder)
	f := readFrame(t, decoder)
	if f.Op != "ws-closed" || f.Code != 1006 || f.WasClean || f.Error == "" {
		t.Fatalf("abnormal close reported as clean: %+v", f)
	}
}
