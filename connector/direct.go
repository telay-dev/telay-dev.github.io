package main

import (
	"fmt"
	"net"
	"strings"
	"sync"
	"time"

	"github.com/pion/webrtc/v4"
)

type directSession struct{ peer *webrtc.PeerConnection }

func (b *Bridge) closeDirect() {
	b.directMu.Lock()
	old := b.direct
	b.direct = nil
	b.directMu.Unlock()
	if old != nil {
		old.peer.Close()
	}
}

func (b *Bridge) offerDirect(sdp string) (string, error) {
	if len(sdp) > 256*1024 || !strings.HasPrefix(sdp, "v=0") {
		return "", fmt.Errorf("invalid SDP")
	}
	var settings webrtc.SettingEngine
	// Use only private or loopback interfaces; do not use public STUN/TURN or scan networks.
	settings.SetIPFilter(func(ip net.IP) bool { return ip.IsPrivate() || ip.IsLoopback() })
	settings.SetIncludeLoopbackCandidate(true)
	peer, err := webrtc.NewAPI(webrtc.WithSettingEngine(settings)).NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		return "", err
	}
	session := &directSession{peer: peer}
	b.closeDirect()
	b.directMu.Lock()
	b.direct = session
	b.directMu.Unlock()
	failed := true
	defer func() {
		if failed {
			peer.Close()
		}
	}()
	peer.OnDataChannel(func(dc *webrtc.DataChannel) {
		if dc.Label() != "relay-v1" {
			dc.Close()
			return
		}
		server, transport := net.Pipe()
		done := make(chan struct{})
		var once sync.Once
		closeAll := func() { once.Do(func() { close(done); server.Close(); transport.Close(); go peer.Close() }) }
		low := make(chan struct{}, 1)
		dc.SetBufferedAmountLowThreshold(65536)
		dc.OnBufferedAmountLow(func() {
			select {
			case low <- struct{}{}:
			default:
			}
		})
		dc.OnClose(closeAll)
		dc.OnError(func(error) { closeAll() })
		dc.OnMessage(func(message webrtc.DataChannelMessage) {
			if message.IsString || len(message.Data) > 16384 {
				closeAll()
				return
			}
			transport.SetWriteDeadline(time.Now().Add(30 * time.Second))
			if _, err := transport.Write(message.Data); err != nil {
				closeAll()
			}
		})
		dc.OnOpen(func() {
			go func() { defer closeAll(); b.Serve(server) }()
			go func() {
				defer closeAll()
				buffer := make([]byte, 16384)
				for {
					n, err := transport.Read(buffer)
					if err != nil {
						return
					}
					if dc.BufferedAmount() > 262144 {
						select {
						case <-low:
						case <-done:
							return
						case <-time.After(10 * time.Second):
							return
						}
					}
					if err := dc.Send(buffer[:n]); err != nil {
						return
					}
				}
			}()
		})
	})
	if err = peer.SetRemoteDescription(webrtc.SessionDescription{Type: webrtc.SDPTypeOffer, SDP: sdp}); err != nil {
		return "", err
	}
	answer, err := peer.CreateAnswer(nil)
	if err != nil {
		return "", err
	}
	gathered := webrtc.GatheringCompletePromise(peer)
	if err = peer.SetLocalDescription(answer); err != nil {
		return "", err
	}
	select {
	case <-gathered:
	case <-time.After(5 * time.Second):
		return "", fmt.Errorf("gathering timeout")
	}
	// Unconnected candidates time out; connected peers are released when their data channel closes.
	time.AfterFunc(20*time.Second, func() {
		if peer.ConnectionState() != webrtc.PeerConnectionStateConnected {
			peer.Close()
		}
	})
	failed = false
	return peer.LocalDescription().SDP, nil
}
