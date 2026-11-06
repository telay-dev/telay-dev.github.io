#!/bin/sh
# Installer revision: 2026-11-06.4
# Installs the connector without sudo, system dependencies, shell changes, or auto-start.
# Installation starts only after the complete script has been read from a pipe.
set -eu

fail() { printf '%s\n' "Install failed: $*" >&2; exit 1; }
quote() { printf "'"; printf '%s' "$1" | sed "s/'/'\\\\''/g"; printf "'"; }
usage() {
  printf '%s\n' \
    'Usage: sh install.sh [--upstream local-URL] [--dir ./telay]' \
    'Options: --downloader auto|curl|wget (default: auto, prefers curl)' \
    'Supports macOS / Linux amd64 and arm64. Windows users can download the executable manually.' \
    'No sudo required. Existing directories are not overwritten. The connector is not started.'
}
cleanup() {
  # Remove only known files from this temporary directory.
  rm -f "$work/SHA256SUMS" "$work/telay"
  rmdir "$work" 2>/dev/null || :
}
download() {
  if [ "$downloader" = curl ]; then
    curl -fL --proto "$protocols" --proto-redir "$protocols" --retry 2 \
      --connect-timeout 15 --max-time 300 -o "$2" "$1"
  elif [ "$protocols" = '=https' ]; then
    wget --https-only --timeout=30 --tries=2 --max-redirect=5 -O "$2" "$1"
  else
    wget --timeout=30 --tries=2 --max-redirect=5 -O "$2" "$1"
  fi
}
digest() {
  case "$checksum_tool" in
    sha256sum) sha256sum "$1" | awk '{print $1}' ;;
    shasum) shasum -a 256 "$1" | awk '{print $1}' ;;
    openssl) openssl dgst -sha256 "$1" | awk '{print $NF}' ;;
  esac
}
main() {
  install_dir='./telay'
  upstream=''
  downloader=auto
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --upstream|--dir|--downloader)
        [ "$#" -ge 2 ] || fail "$1 requires a value"
        case "$1" in
          --upstream) upstream=$2 ;;
          --dir) install_dir=$2 ;;
          --downloader) downloader=$2 ;;
        esac
        shift 2 ;;
      -h|--help) usage; return ;;
      *) fail "Unknown option: $1 (use --help for usage)" ;;
    esac
  done
  protocols='=https'
  case "$downloader" in auto|curl|wget) : ;; *) fail '--downloader must be auto, curl, or wget' ;; esac
  if [ "$downloader" = auto ]; then
    if command -v curl >/dev/null 2>&1; then downloader=curl
    elif command -v wget >/dev/null 2>&1; then downloader=wget
    else fail 'curl or wget is required'; fi
  fi
  command -v "$downloader" >/dev/null 2>&1 || fail "Missing dependency: $downloader"
  if command -v sha256sum >/dev/null 2>&1; then checksum_tool=sha256sum
  elif command -v shasum >/dev/null 2>&1; then checksum_tool=shasum
  elif command -v openssl >/dev/null 2>&1; then checksum_tool=openssl
  else fail 'sha256sum, shasum, or openssl is required for checksum verification'; fi
  case "$(uname -s)" in
    Darwin) os=darwin ;;
    Linux) os=linux ;;
    *) fail 'This installer supports macOS and Linux only; download the executable manually for other systems' ;;
  esac
  case "$(uname -m)" in
    x86_64|amd64) arch=amd64 ;;
    arm64|aarch64) arch=arm64 ;;
    *) fail 'Unsupported CPU architecture; only amd64 and arm64 are available' ;;
  esac
  [ -n "$install_dir" ] || fail '--dir cannot be empty'
  case "$install_dir" in /*) : ;; *) install_dir="$(pwd -P)/$install_dir" ;; esac
  while [ "${install_dir%/}" != "$install_dir" ]; do install_dir=${install_dir%/}; done
  name=${install_dir##*/}
  case "$name" in ''|.|..) fail 'Choose a new installation subdirectory' ;; esac
  parent=${install_dir%/*}
  [ -n "$parent" ] || parent=/
  parent=$(cd "$parent" && pwd -P) || fail 'The installation parent directory does not exist; create it first'
  install_dir="$parent/$name"
  [ ! -e "$install_dir" ] && [ ! -L "$install_dir" ] || fail "Directory already exists and was not changed: ${install_dir}; choose another with --dir"
  umask 077
  work=$(mktemp -d "$parent/.telay-install.XXXXXX") || fail 'Could not create a temporary directory'
  trap cleanup EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM HUP
  binary="telay-${os}-${arch}"
  [ "$os" != windows ] || binary="${binary}.exe"
  printf '%s\n' "Platform: ${os} / ${arch}; downloading with ${downloader}..."
  downloads=${TELAY_DOWNLOADS:-https://github.com/GitaiQAQ/telay/releases/latest/download}
  download "$downloads/SHA256SUMS" "$work/SHA256SUMS" || fail 'Could not download the checksum list; nothing was installed'
  expected=$(awk -v name="$binary" '
    $2 == name { count++; hash=tolower($1) }
    END {
      if (count != 1 || length(hash) != 64 || hash ~ /[^0-9a-f]/) exit 1
      print hash
    }
  ' "$work/SHA256SUMS") || fail 'The checksum list has no unique valid SHA-256 for this platform'
  download "$downloads/$binary" "$work/telay" || fail 'Could not download the connector; nothing was installed'
  actual=$(digest "$work/telay") || fail 'Could not calculate SHA-256; nothing was installed'
  [ "$actual" = "$expected" ] || fail 'SHA-256 mismatch; refusing to install an unverified download'
  printf '%s\n' 'SHA-256 verified (integrity check, not an independent release signature).'
  [ -s "$work/telay" ] || fail 'The connector file is empty'
  chmod 700 "$work/telay"
  mkdir "$install_dir" || fail 'Could not create the installation directory; no existing files were changed'
  mv "$work/telay" "$install_dir/telay" || fail "Installation failed; check directory: ${install_dir}"
  printf '\n%s\n' "Installed: $install_dir/telay" 'The connector was not started. Run:'
  quote "$install_dir/telay"
  if [ -n "$upstream" ]; then printf ' --upstream '; quote "$upstream"; fi
  printf '\n'
  printf '\n%s\n' 'For DSH, add --profile dsh. For a bandwidth probe, add --probe-only. Press Ctrl-C to stop.'
}
main "$@"
