package main

import (
	"context"
	"errors"
	"sync"

	"github.com/coder/websocket"
)

const (
	maxSocketQueuedBytes    = maxBody
	maxSocketQueuedMessages = 128
)

type socketMessage struct {
	typ  websocket.MessageType
	data []byte
}

// Keep reading upstream while the tunnel writer is busy. coder/websocket
// handles Ping/Pong inside Read, so synchronous forwarding would stall the
// protocol heartbeat along with application data. Bound both bytes (including
// the message being forwarded) and message count; overload fails the socket
// instead of silently dropping messages or growing an unbounded buffer.
func forwardWebSocket(ctx context.Context, s *websocket.Conn, request Frame, send func(Frame)) {
	messages := make(chan socketMessage, maxSocketQueuedMessages)
	var mu sync.Mutex
	queuedBytes := 0
	var terminal Frame
	go func() {
		defer close(messages)
		for {
			typ, data, err := s.Read(ctx)
			if err != nil {
				terminal = socketClosedFrame(request.ID, err)
				return
			}
			mu.Lock()
			full := len(data) > maxSocketQueuedBytes-queuedBytes
			if !full {
				queuedBytes += len(data)
			}
			mu.Unlock()
			if !full {
				select {
				case messages <- socketMessage{typ: typ, data: data}:
					continue
				default:
				}
			}
			terminal = Frame{ID: request.ID, Op: "ws-error", Error: "upstream WebSocket receive buffer exceeded"}
			s.CloseNow()
			return
		}
	}()

	// Start the reader before this write: even ws-opened can be queued behind a
	// large HTTP response on the shared tunnel.
	send(Frame{ID: request.ID, Op: "ws-opened", Protocol: s.Subprotocol()})
	for {
		select {
		case <-ctx.Done():
			return
		case message, ok := <-messages:
			if !ok {
				// A close follows every already accepted message, even if the
				// upstream closed while the tunnel was still forwarding it.
				send(terminal)
				return
			}
			data := message.data
			if request.Chunked && len(data) > resultChunk {
				send(Frame{ID: request.ID, Op: "ws-data-head", Type: int(message.typ)})
				for len(data) > 0 {
					n := min(len(data), resultChunk)
					send(Frame{ID: request.ID, Op: "ws-data-part", Body: data[:n]})
					data = data[n:]
				}
				send(Frame{ID: request.ID, Op: "ws-data-end"})
			} else {
				send(Frame{ID: request.ID, Op: "ws-data", Type: int(message.typ), Body: data})
			}
			mu.Lock()
			queuedBytes -= len(message.data)
			mu.Unlock()
		}
	}
}

func socketClosedFrame(id int, err error) Frame {
	f := Frame{ID: id, Op: "ws-closed", Code: int(websocket.StatusAbnormalClosure)}
	var closed websocket.CloseError
	if errors.As(err, &closed) {
		f.Code = int(closed.Code)
		f.Reason = closed.Reason
		f.WasClean = true
	} else if err != nil {
		f.Error = err.Error()
	}
	return f
}
