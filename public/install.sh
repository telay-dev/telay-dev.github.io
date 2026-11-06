#!/bin/sh
# Installer revision: 2026-11-06.3
# Telay 安装器；不会启动连接器、安装系统依赖或修改 shell 配置。
# 整个安装流程在 main 中：通过管道下载时，脚本未完整解析不会开始安装。
set -eu

fail() { printf '%s\n' "安装失败：$*" >&2; exit 1; }
quote() { printf "'"; printf '%s' "$1" | sed "s/'/'\\\\''/g"; printf "'"; }
usage() {
  printf '%s\n' \
    '用法：sh install.sh --web https://连接网站 [--upstream 本机URL] [--dir ./telay]' \
    '选项：--downloader auto|curl|wget（默认 auto，优先 curl）' \
    '支持 macOS / Linux 的 amd64 / arm64；Windows 请下载 ZIP。' \
    '不使用 sudo，不覆盖已有目录，不自动运行连接器。'
}
cleanup() {
  # 仅清理本次 mktemp 创建的已知文件，绝不递归删除安装目录。
  rm -f "$work/archive.zip" "$work/SHA256SUMS" "$work/telay" \
    "$work/README.md" "$work/THIRD_PARTY_NOTICES.txt" "$work/THIRD_PARTY_LICENSES.zip"
  rmdir "$work" 2>/dev/null || :
}
download() {
  if [ "$downloader" = curl ]; then
    curl -fL --proto "$protocols" --proto-redir "$protocols" --retry 2 \
      --connect-timeout 15 --max-time 300 -o "$2" "$1"
  else
    wget --timeout=30 --tries=2 --max-redirect=0 -O "$2" "$1"
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
  site=''
  install_dir='./telay'
  upstream=''
  downloader=auto
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --web|--site|--upstream|--dir|--downloader)
        [ "$#" -ge 2 ] || fail "$1 缺少参数"
        case "$1" in
          --web|--site) site=$2 ;;
          --upstream) upstream=$2 ;;
          --dir) install_dir=$2 ;;
          --downloader) downloader=$2 ;;
        esac
        shift 2 ;;
      -h|--help) usage; return ;;
      *) fail "未知参数：$1（使用 --help 查看说明）" ;;
    esac
  done
  # 清除复制命令时 origin 两端的空格/制表符，仍拒绝地址中的空白。
  site=$(printf '%s' "$site" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  [ -n "$site" ] || fail '必须通过 --web 指定连接网站'
  site=${site%/}
  # 仅接受 origin；生产必须 HTTPS，HTTP 只供 localhost 验证。
  case "$site" in
    https://*) authority=${site#https://}; protocols='=https' ;;
    http://localhost|http://localhost:*|http://127.0.0.1|http://127.0.0.1:*)
      authority=${site#http://}; protocols='=http,https' ;;
    *) fail '--web 必须是 HTTPS 站点（本地测试可用 http://localhost:端口）' ;;
  esac
  printf '%s\n' "$authority" | awk '
    /^[A-Za-z0-9.-]+(:[0-9]+)?$/ { valid=1 }
    END { exit !(NR == 1 && valid) }
  ' || fail '--web 只能是站点 origin，不能包含路径、凭证或查询参数'
  case "$site" in
    http://*) case "${authority%%:*}" in localhost|127.0.0.1) : ;; *) fail 'HTTP 仅限本地测试' ;; esac ;;
  esac
  case "$downloader" in auto|curl|wget) : ;; *) fail '--downloader 仅支持 auto、curl、wget' ;; esac
  if [ "$downloader" = auto ]; then
    if command -v curl >/dev/null 2>&1; then downloader=curl
    elif command -v wget >/dev/null 2>&1; then downloader=wget
    else fail '需要 curl 或 wget，请安装后重试'; fi
  fi
  command -v "$downloader" >/dev/null 2>&1 || fail "缺少 $downloader"
  command -v unzip >/dev/null 2>&1 || fail '需要 unzip，请安装后重试'
  if command -v sha256sum >/dev/null 2>&1; then checksum_tool=sha256sum
  elif command -v shasum >/dev/null 2>&1; then checksum_tool=shasum
  elif command -v openssl >/dev/null 2>&1; then checksum_tool=openssl
  else fail '需要 sha256sum、shasum 或 openssl 用于校验'; fi
  case "$(uname -s)" in
    Darwin) os=darwin ;;
    Linux) os=linux ;;
    *) fail '此脚本仅支持 macOS / Linux；其他系统请手动下载' ;;
  esac
  case "$(uname -m)" in
    x86_64|amd64) arch=amd64 ;;
    arm64|aarch64) arch=arm64 ;;
    *) fail '不支持此 CPU 架构；仅提供 amd64 / arm64' ;;
  esac
  [ -n "$install_dir" ] || fail '--dir 不能为空'
  case "$install_dir" in /*) : ;; *) install_dir="$(pwd -P)/$install_dir" ;; esac
  while [ "${install_dir%/}" != "$install_dir" ]; do install_dir=${install_dir%/}; done
  name=${install_dir##*/}
  case "$name" in ''|.|..) fail '请选择明确的新安装子目录' ;; esac
  parent=${install_dir%/*}
  [ -n "$parent" ] || parent=/
  parent=$(cd "$parent" && pwd -P) || fail '安装目录的父目录不存在，请先创建'
  install_dir="$parent/$name"
  [ ! -e "$install_dir" ] && [ ! -L "$install_dir" ] || fail "目录已存在，未覆盖：${install_dir}；请使用 --dir 选择新目录"
  umask 077
  work=$(mktemp -d "$parent/.telay-install.XXXXXX") || fail '无法创建临时目录'
  trap cleanup EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM HUP
  binary="telay-${os}-${arch}"
  archive="${binary}.zip"
  # 显式划定变量边界，避免旧 shell 将相邻 UTF-8 标点误识别为变量名。
  printf '%s\n' "识别平台：${os} / ${arch}；正在使用 ${downloader} 下载…"
  downloads='https://raw.githubusercontent.com/GitaiQAQ/telay/main/public/downloads'
  download "$downloads/SHA256SUMS" "$work/SHA256SUMS" || fail '校验清单下载失败；未安装'
  expected=$(awk -v name="$archive" '
    $2 == name { count++; hash=tolower($1) }
    END {
      if (count != 1 || length(hash) != 64 || hash ~ /[^0-9a-f]/) exit 1
      print hash
    }
  ' "$work/SHA256SUMS") || fail '校验清单缺少有效且唯一的平台 SHA-256'
  download "$downloads/$archive" "$work/archive.zip" || fail '连接器下载失败；未安装'
  actual=$(digest "$work/archive.zip") || fail '无法计算 SHA-256；未安装'
  [ "$actual" = "$expected" ] || fail 'SHA-256 不一致，拒绝解压；请检查下载来源后重试'
  printf '%s\n' 'SHA-256 校验通过（完整性校验，不是独立发行签名）。'
  unzip -p "$work/archive.zip" "$binary" > "$work/telay" || fail '无法提取连接器'
  [ -s "$work/telay" ] || fail '连接器文件为空'
  for item in README.md THIRD_PARTY_NOTICES.txt THIRD_PARTY_LICENSES.zip; do
    unzip -p "$work/archive.zip" "$item" > "$work/$item" || fail "无法提取 $item"
  done
  chmod 700 "$work/telay"
  mkdir "$install_dir" || fail '无法创建安装目录；未覆盖已有文件'
  for item in telay README.md THIRD_PARTY_NOTICES.txt THIRD_PARTY_LICENSES.zip; do
    mv "$work/$item" "$install_dir/$item" || fail "写入失败；部分文件可能已在 ${install_dir}，请检查"
  done
  printf '\n%s\n' "安装完成：$install_dir/telay" '未启动连接器。终端运行：'
  quote "$install_dir/telay"; printf ' --web '; quote "$site"
  if [ -n "$upstream" ]; then printf ' --upstream '; quote "$upstream"; fi
  printf '\n'
  printf '\n%s\n' '用于 DSH 时，启动命令额外加 --profile dsh。仅测速加 --probe-only。Ctrl-C 停止。'
}
main "$@"
