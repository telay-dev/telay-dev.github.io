package main

import (
	"flag"
	"fmt"
	"io"
	"net"
	"net/url"
	"strings"
)

type options struct {
	Upstream, Web, Profile string
	Probe                  bool
}

func parseOptions(args []string, output io.Writer) (options, error) {
	var o options
	var legacyWeb string
	fs := flag.NewFlagSet("telay", flag.ContinueOnError)
	fs.SetOutput(output)
	fs.StringVar(&o.Upstream, "upstream", "", "local HTTP service URL")
	fs.StringVar(&o.Web, "web", "", "Telay site origin")
	fs.StringVar(&legacyWeb, "site", "", "deprecated alias for --web")
	fs.StringVar(&o.Profile, "profile", "generic", "generic or dsh")
	fs.BoolVar(&o.Probe, "probe-only", false, "run a bandwidth test only")
	fs.Usage = func() {
		fmt.Fprintln(output, "Telay\n\nUsage: telay --web https://telay.js.org --upstream 'http://127.0.0.1:3080/'\n\n  --web URL              Telay site origin\n  --upstream URL         Local HTTP service URL; prompt if omitted\n  --profile generic|dsh  Integration profile (default: generic)\n  --probe-only           Run a bandwidth test only\n  -h, --help             Show help\n\nThird-party license texts:\nhttps://github.com/GitaiQAQ/telay/releases/latest/download/THIRD_PARTY_LICENSES.txt")
	}
	if err := fs.Parse(args); err != nil {
		return o, err
	}
	if fs.NArg() > 1 {
		return o, fmt.Errorf("only one local service URL is allowed")
	}
	if fs.NArg() == 1 {
		if o.Upstream != "" {
			return o, fmt.Errorf("specify the local service URL only once")
		}
		o.Upstream = fs.Arg(0)
	}
	o.Web = strings.TrimSpace(o.Web)
	legacyWeb = strings.TrimSpace(legacyWeb)
	if o.Web != "" && legacyWeb != "" && strings.TrimRight(o.Web, "/") != strings.TrimRight(legacyWeb, "/") {
		return o, fmt.Errorf("--web and deprecated --site values do not match")
	}
	if o.Web == "" {
		o.Web = legacyWeb
	}
	o.Web = strings.TrimRight(o.Web, "/")
	o.Upstream = strings.TrimSpace(o.Upstream)
	if o.Profile != "generic" && o.Profile != "dsh" {
		return o, fmt.Errorf("--profile must be generic or dsh")
	}
	if o.Web != "" {
		if err := validateWeb(o.Web); err != nil {
			return o, err
		}
	}
	if o.Upstream != "" {
		if _, err := validateUpstream(o.Upstream); err != nil {
			return o, err
		}
	}
	return o, nil
}

func validateWeb(raw string) error {
	u, err := url.Parse(raw)
	if err != nil || u == nil || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") {
		return fmt.Errorf("--web must be a site origin without a path, credentials, or query parameters")
	}
	if u.Scheme == "https" {
		return nil
	}
	ip := net.ParseIP(u.Hostname())
	if u.Scheme == "http" && (u.Hostname() == "localhost" || ip != nil && ip.IsLoopback()) {
		return nil
	}
	return fmt.Errorf("--web must use HTTPS; HTTP is allowed only for localhost testing")
}
