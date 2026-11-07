package main

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/tailscale/tailcat"
	"tailscale.com/tailcfg"
)

func TestPairingIdentitySurvivesRestart(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.json")
	unlock, err := lockIdentity(path)
	if err != nil {
		t.Fatal(err)
	}
	defer unlock()
	identity, err := loadIdentity(path)
	if err != nil {
		t.Fatal(err)
	}
	server := &tailcat.Server{
		Logf: func(string, ...any) {},
		// Explicit local relay metadata prevents discovery/network access to
		// public relays. Starting a server does not wait for DERP admission.
		Region: &tailcfg.DERPRegion{RegionID: 999, Nodes: []*tailcfg.DERPNode{{
			Name: "test", RegionID: 999, HostName: "localhost", IPv4: "127.0.0.1", DERPPort: 1, STUNPort: -1, InsecureForTests: true,
		}}},
	}
	identity.configure(server)
	if err := server.Start(); err != nil {
		t.Fatal(err)
	}
	identity.Address = server.TailcatAddr()
	server.Close()
	if err := saveIdentity(path, identity); err != nil {
		t.Fatal(err)
	}
	restored, err := loadIdentity(path)
	if err != nil {
		t.Fatal(err)
	}
	if !restored.PrivateKey.Equal(identity.PrivateKey) || !restored.PresharedKey.Equal(identity.PresharedKey) {
		t.Fatal("identity keys changed")
	}
	restarted := &tailcat.Server{Logf: func(string, ...any) {}}
	restored.configure(restarted)
	if err := restarted.Start(); err != nil {
		t.Fatal(err)
	}
	defer restarted.Close()
	if restarted.TailcatAddr() != identity.Address {
		t.Fatal("pairing token changed after restart")
	}
	if runtime.GOOS != "windows" {
		stat, err := os.Stat(path)
		if err != nil || stat.Mode().Perm() != 0600 {
			t.Fatal("identity file must be private")
		}
	}
}

func TestPairingIdentityLock(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.json")
	unlock, err := lockIdentity(path)
	if err != nil {
		t.Fatal(err)
	}
	defer unlock()
	if release, err := lockIdentity(path); err == nil {
		release()
		t.Fatal("two connectors can use the same identity concurrently")
	}
	unlock()
	release, err := lockIdentity(path)
	if err != nil {
		t.Fatal("identity remains locked after process releases it")
	}
	release()
}

func TestPairingIdentityRejectsCorruptState(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.json")
	for _, contents := range []string{"", "{}", `{"version":2}`, `{"version":1,"privateKey":"secret-invalid-key"}`} {
		os.WriteFile(path, []byte(contents), 0600)
		if _, err := loadIdentity(path); err == nil {
			t.Fatal("invalid state silently replaced")
		} else if bytes.Contains([]byte(err.Error()), []byte("secret-invalid-key")) {
			t.Fatal("diagnostics exposed key material")
		}
		actual, _ := os.ReadFile(path)
		if string(actual) != contents {
			t.Fatal("invalid state was overwritten")
		}
	}
	// A public token from another identity cannot stand in for the private key.
	k := tailcat.NewPrivateKey()
	other := tailcat.NewPrivateKey()
	identity := &connectorIdentity{Version: 1, PrivateKey: k.Private, PresharedKey: k.Public.PresharedKey, Address: other.Public.Addr()}
	data, _ := json.Marshal(identity)
	os.WriteFile(path, data, 0600)
	if _, err := loadIdentity(path); err == nil {
		t.Fatal("mismatched address accepted")
	}
}

func TestIdentityPathsAndOptions(t *testing.T) {
	one, err := identityPath(options{Upstream: "http://127.0.0.1:3080/?token=first"})
	if err != nil {
		t.Fatal(err)
	}
	two, _ := identityPath(options{Upstream: "http://127.0.0.1:3080?token=second#ignored"})
	other, _ := identityPath(options{Upstream: "http://127.0.0.1:3081/"})
	probe, _ := identityPath(options{Probe: true})
	if one != two || one == other || one == probe {
		t.Fatal("identity must follow the upstream, independently of startup credentials")
	}
	opts, err := parseOptions([]string{"--state", " custom.json "}, io.Discard)
	if err != nil || opts.State != "custom.json" {
		t.Fatal("custom identity option failed")
	}
	custom, err := identityPath(opts)
	if err != nil || !filepath.IsAbs(custom) || filepath.Base(custom) != "custom.json" {
		t.Fatal("custom identity path failed")
	}
	opts, err = parseOptions([]string{"--ephemeral"}, io.Discard)
	if err != nil || !opts.Ephemeral {
		t.Fatal("ephemeral identity option failed")
	}
	if _, err := parseOptions([]string{"--state", "custom.json", "--ephemeral"}, io.Discard); err == nil {
		t.Fatal("incompatible identity options accepted")
	}
}
