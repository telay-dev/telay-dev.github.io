package main

import (
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/tailscale/tailcat"
	"tailscale.com/types/key"
)

type connectorIdentity struct {
	Version      int                  `json:"version"`
	PrivateKey   key.NodePrivate      `json:"privateKey"`
	PresharedKey tailcat.PresharedKey `json:"presharedKey"`
	Address      tailcat.Addr         `json:"address,omitempty"`
}

func identityPath(opts options) (string, error) {
	if opts.State != "" {
		return filepath.Abs(opts.State)
	}
	directory, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	upstream := "probe-only"
	if !opts.Probe {
		u, err := validateUpstream(opts.Upstream)
		if err != nil {
			return "", err
		}
		// Startup credentials may change without changing the pairing identity.
		u.RawQuery, u.Fragment = "", ""
		u.Path = "/"
		upstream = u.String()
	}
	return filepath.Join(directory, "telay", "identities", fmt.Sprintf("%x.json", sha256.Sum256([]byte(upstream)))), nil
}

func loadIdentity(path string) (*connectorIdentity, error) {
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		k := tailcat.NewPrivateKey()
		return &connectorIdentity{Version: 1, PrivateKey: k.Private, PresharedKey: k.Public.PresharedKey}, nil
	}
	if err != nil {
		return nil, err
	}
	var identity connectorIdentity
	if json.Unmarshal(data, &identity) != nil || identity.Version != 1 || identity.PrivateKey.IsZero() || identity.PresharedKey.IsZero() {
		// Never include the file contents or key parser errors in diagnostics.
		return nil, errors.New("invalid pairing identity file; refusing to replace it")
	}
	if identity.Address != "" {
		ci, err := tailcat.ParseAddr(identity.Address)
		if err != nil || ci.ServerPublic.NodePublic != identity.PrivateKey.Public() || !ci.PresharedKey.Equal(identity.PresharedKey) || len(ci.Region) != 1 || ci.Region[0] == nil || len(ci.Region[0].Nodes) == 0 {
			return nil, errors.New("saved pairing address does not match the identity or lacks relay information")
		}
	}
	return &identity, nil
}

func (identity *connectorIdentity) configure(s *tailcat.Server) {
	s.Key, s.PresharedKey = identity.PrivateKey, identity.PresharedKey
	if identity.Address != "" {
		ci, _ := tailcat.ParseAddr(identity.Address) // Validated by loadIdentity.
		s.Region = ci.Region[0]
	}
}

func saveIdentity(path string, identity *connectorIdentity) error {
	data, err := json.Marshal(identity)
	if err != nil {
		return errors.New("cannot encode pairing identity")
	}
	f, err := os.CreateTemp(filepath.Dir(path), ".identity-*")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	defer f.Close()
	// CreateTemp uses 0600. Rename within the same directory avoids leaving a
	// partially written identity if startup is interrupted.
	if _, err := f.Write(data); err != nil {
		return err
	}
	if err := f.Sync(); err != nil {
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	return os.Rename(f.Name(), path)
}

func lockIdentity(path string) (func(), error) {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return nil, err
	}
	f, err := os.OpenFile(path+".lock", os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, err
	}
	if err := lockIdentityFile(f); err != nil {
		f.Close()
		return nil, fmt.Errorf("pairing identity is already in use or cannot be locked: %w", err)
	}
	// Keep the lock inode: unlinking it could let another process lock a new
	// inode while this one is still held. OS locks release even after a crash.
	return func() { f.Close() }, nil
}
