#!/bin/sh
set -eu

main() {
  site=''
  upstream=''
  install_dir="$HOME/.local/bin"
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --web|--site|--upstream|--dir)
        [ "$#" -ge 2 ] || { echo "Missing value for $1" >&2; exit 1; }
        case "$1" in
          --web|--site) site=$2 ;;
          --upstream) upstream=$2 ;;
          --dir) install_dir=$2 ;;
        esac
        shift 2 ;;
      -h|--help)
        echo 'Usage: sh install.sh --web SITE [--upstream URL] [--dir DIRECTORY]'
        echo 'Installs telay to ~/.local/bin by default. Requires curl.'
        return ;;
      *) echo "Unknown option: $1" >&2; exit 1 ;;
    esac
  done
  [ -n "$site" ] || { echo 'Specify the site with --web' >&2; exit 1; }
  case "$(uname -s)" in Darwin) os=darwin ;; Linux) os=linux ;; *) echo 'Unsupported operating system' >&2; exit 1 ;; esac
  case "$(uname -m)" in arm64|aarch64) arch=arm64 ;; x86_64|amd64) arch=amd64 ;; *) echo 'Unsupported architecture' >&2; exit 1 ;; esac
  binary="telay-$os-$arch"
  downloads=${TELAY_DOWNLOADS:-https://github.com/telay-dev/telay-dev.github.io/releases/latest/download}
  work=$(mktemp -d)
  trap 'rm -rf "$work"' EXIT HUP INT TERM
  echo "Downloading Telay for $os/$arch..."
  curl -fsSL "$downloads/SHA256SUMS" -o "$work/SHA256SUMS"
  curl -fSL "$downloads/$binary" -o "$work/telay"
  expected=$(awk -v name="$binary" '$2 == name {print $1}' "$work/SHA256SUMS")
  [ -n "$expected" ] || { echo 'Checksum not found' >&2; exit 1; }
  if command -v sha256sum >/dev/null 2>&1; then
    actual=$(sha256sum "$work/telay" | awk '{print $1}')
  else
    actual=$(shasum -a 256 "$work/telay" | awk '{print $1}')
  fi
  [ "$actual" = "$expected" ] || { echo 'Checksum verification failed' >&2; exit 1; }
  mkdir -p "$install_dir"
  chmod 755 "$work/telay"
  mv "$work/telay" "$install_dir/telay"
  printf '\nInstalled: %s/telay\nRun: ' "$install_dir"
  quote() { printf "'"; printf '%s' "$1" | sed "s/'/'\\\\''/g"; printf "'"; }
  quote "$install_dir/telay"; printf ' --web '; quote "$site"
  if [ -n "$upstream" ]; then printf ' --upstream '; quote "$upstream"; fi
  printf '\n'
}
main "$@"
