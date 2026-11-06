package main

import (
	"bytes"
	"errors"
	"flag"
	"io"
	"strings"
	"testing"
)

func TestOptionsNonInteractive(t *testing.T) {
	u := "http://127.0.0.1:3080/?token=a%27b&next=%2F&value=中文"
	o, err := parseOptions([]string{"--web", " https://example.test/ ", "--upstream", u, "--profile", "dsh"}, io.Discard)
	if err != nil || o.Web != "https://example.test" || o.Upstream != u || o.Profile != "dsh" {
		t.Fatalf("完整 URL 和参数应保留：%+v, %v", o, err)
	}
	for _, args := range [][]string{
		{"--web", "https://example.test", u},
		{"--site", "https://example.test/", "--upstream", u},
		{"--web", "https://example.test", "--site", "https://example.test/", "--upstream", u},
	} {
		o, err := parseOptions(args, io.Discard)
		if err != nil || o.Web != "https://example.test" || o.Upstream != u {
			t.Fatalf("位置参数及旧别名应兼容：%+v, %v", o, err)
		}
	}
}

func TestOptionsReject(t *testing.T) {
	for _, args := range [][]string{
		{"--web", "https://one.test", "--site", "https://two.test"},
		{"--web", "https://example.test/path"}, {"--web", "https://example.test/?token=x"},
		{"--web", "https://example.test/#fragment"}, {"--web", "https://user@example.test"},
		{"--web", "http://example.test"}, {"--web", "https:///"},
		{"--upstream", "http://example.test/"}, {"--upstream", "http://127.0.0.1:3080/path"},
		{"--profile", "unknown"}, {"--unknown"}, {"--web"},
		{"--upstream", "http://127.0.0.1/", "http://127.0.0.1/"},
		{"http://127.0.0.1/", "http://127.0.0.1/"},
	} {
		if _, err := parseOptions(args, io.Discard); err == nil {
			t.Errorf("应拒绝参数：%v", args)
		}
	}
}

func TestOptionsLocalAndHelp(t *testing.T) {
	for _, raw := range []string{"http://localhost:5173", "http://127.0.0.1:5173", "http://[::1]:5173"} {
		if _, err := parseOptions([]string{"--web", raw}, io.Discard); err != nil {
			t.Errorf("本地测试 origin 应可用：%s: %v", raw, err)
		}
	}
	var out bytes.Buffer
	if _, err := parseOptions([]string{"--help"}, &out); !errors.Is(err, flag.ErrHelp) {
		t.Fatalf("help 应返回 flag.ErrHelp：%v", err)
	}
	if !strings.Contains(out.String(), "Telay") || !strings.Contains(out.String(), "--web") || !strings.Contains(out.String(), "--upstream") || strings.Contains(out.String(), "--site") {
		t.Fatalf("帮助只推荐新版命令：%s", out.String())
	}
}
