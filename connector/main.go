package main

import (
	"bufio"
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"sync"
	"time"

	"github.com/tailscale/tailcat"
)

func main() {
	opts, err := parseOptions(os.Args[1:], os.Stderr)
	if errors.Is(err, flag.ErrHelp) {
		return
	}
	if err != nil {
		log.Fatal("startup failed: ", err)
	}
	var bridge *Bridge
	if opts.Probe {
		bridge = &Bridge{}
	} else {
		if opts.Upstream == "" {
			fmt.Print("Enter the local HTTP service URL (an initial token is allowed and stays local):\n> ")
			line, _ := bufio.NewReader(os.Stdin).ReadString('\n')
			opts.Upstream = strings.TrimSpace(line)
		}
		u, err := validateUpstream(opts.Upstream)
		if err != nil {
			log.Fatal(err)
		}
		jar, _ := cookiejar.New(nil)
		client := &http.Client{Jar: jar, Timeout: 90 * time.Second, Transport: &http.Transport{Proxy: nil}, CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) > 5 || req.URL.Scheme != u.Scheme || req.URL.Host != u.Host {
				return fmt.Errorf("redirects outside the configured local upstream are not allowed")
			}
			return nil
		}}
		resp, err := client.Get(u.String())
		if err != nil {
			log.Fatal("cannot reach the local HTTP service; start the upstream first")
		}
		resp.Body.Close()
		if resp.StatusCode != 200 {
			log.Fatalf("upstream returned HTTP %d; use the full startup or authentication URL", resp.StatusCode)
		}
		u.RawQuery = ""
		u.Fragment = ""
		bridge = &Bridge{upstream: u, client: client, profile: opts.Profile}
	}
	var connMu sync.Mutex
	var current net.Conn
	s := &tailcat.Server{Logf: func(string, ...any) {}, OnTCP: func(port uint16) func(net.Conn) {
		if port != 8447 {
			return nil
		}
		return func(c net.Conn) {
			bridge.closeDirect()
			// Replace the previous pairing promptly so delayed netstack shutdown does not block device switching.
			connMu.Lock()
			old := current
			current = c
			connMu.Unlock()
			if old != nil {
				old.Close()
			}
			defer func() {
				connMu.Lock()
				if current == c {
					current = nil
				}
				connMu.Unlock()
			}()
			bridge.Serve(c)
		}
	}}
	if err := s.Start(); err != nil {
		log.Fatal("failed to connect to the public DERP relay: ", err)
	}
	defer s.Close()
	addr := string(s.TailcatAddr())
	fmt.Println("\nTelay is running · direct connection preferred")
	fmt.Println("The pairing address grants access. Keep it private.")
	fmt.Println("Pairing address:\n" + addr)
	if opts.Web != "" {
		u, err := url.Parse(opts.Web)
		if err == nil && (u.Scheme == "https" || u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1") {
			u.Fragment = "pair=" + addr
			fmt.Println("\nOpen in a browser:\n" + u.String())
		}
	}
	fmt.Println("\nPress Ctrl-C to stop. Restarting creates a new pairing address.")
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	<-ctx.Done()
}

func validateUpstream(raw string) (*url.URL, error) {
	u, err := url.Parse(raw)
	if err != nil || u == nil || u.Scheme != "http" || u.User != nil || u.Host == "" {
		return nil, fmt.Errorf("only a local HTTP service URL is allowed")
	}
	ip := net.ParseIP(u.Hostname())
	if ip == nil || !ip.IsLoopback() {
		return nil, fmt.Errorf("upstream must use a loopback IP, for example http://127.0.0.1:3080/")
	}
	if u.Path != "" && u.Path != "/" {
		return nil, fmt.Errorf("only root-path deployments are supported")
	}
	return u, nil
}
