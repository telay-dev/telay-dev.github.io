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
		log.Fatal("启动失败：", err)
	}
	var bridge *Bridge
	if opts.Probe {
		bridge = &Bridge{}
	} else {
		if opts.Upstream == "" {
			fmt.Print("粘贴本机 HTTP 服务 URL（可含启动 token，仅留在本机）：\n> ")
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
				return fmt.Errorf("拒绝跳转至固定本机上游以外地址")
			}
			return nil
		}}
		resp, err := client.Get(u.String())
		if err != nil {
			log.Fatal("本机 HTTP 服务无法访问，请先启动上游")
		}
		resp.Body.Close()
		if resp.StatusCode != 200 {
			log.Fatalf("上游返回 HTTP %d，请使用完整启动或认证 URL", resp.StatusCode)
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
			// 新配对连接接替旧连接，避免 netstack 的延迟关闭阻塞手机切换。
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
		log.Fatal("公共 DERP 连接失败：", err)
	}
	defer s.Close()
	addr := string(s.TailcatAddr())
	fmt.Println("\nTelay 已启动 · 直连优先")
	fmt.Println("配对地址等同访问密码，请勿分享。")
	fmt.Println("配对地址：\n" + addr)
	if opts.Web != "" {
		u, err := url.Parse(opts.Web)
		if err == nil && (u.Scheme == "https" || u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1") {
			u.Fragment = "pair=" + addr
			fmt.Println("\n浏览器打开：\n" + u.String())
		}
	}
	fmt.Println("\nCtrl-C 停止；重启后配对地址会变化。")
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	<-ctx.Done()
}

func validateUpstream(raw string) (*url.URL, error) {
	u, err := url.Parse(raw)
	if err != nil || u == nil || u.Scheme != "http" || u.User != nil || u.Host == "" {
		return nil, fmt.Errorf("仅接受本机 HTTP 服务启动 URL")
	}
	ip := net.ParseIP(u.Hostname())
	if ip == nil || !ip.IsLoopback() {
		return nil, fmt.Errorf("上游地址必须是 loopback IP，例如 http://127.0.0.1:3080/")
	}
	if u.Path != "" && u.Path != "/" {
		return nil, fmt.Errorf("仅支持根路径部署")
	}
	return u, nil
}
