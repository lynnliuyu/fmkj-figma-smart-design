#!/usr/bin/env bash
#
# 给这台设备开通外网访问（在设备上以 root 运行，一条命令）。
#
# 作用：装 frpc 客户端 → 写配置（客户专属子域名）→ 开机自启 → 等连上 → 打印客户用的网址。
# 服务器端不用动：frps 按请求的 Host 自动路由到这台设备的连接。
#
# 用法：
#   bash enable-public-access.sh --host dealer01.example.com \
#        --server tunnel.example.com --token '那串随机字符串'
#   可选：--port 8890（设备本机端口，默认从 .env 的 FMKJ_PORT 读；新版设备默认 8890）
#         --bandwidth 2MB（每客户限速，默认 2MB/s）
#         --frpc /path/to/frpc（本地已有二进制，或 --frpc-url 指定下载地址）
#         --check（装完顺手跑一次外网自检）
#         --disable（关掉并清掉配置）
#         --dry-run（只看会做什么）
set -euo pipefail

HOST=""
SERVER=""
TOKEN=""
PORT=""
BANDWIDTH="2MB"
FRPC_BIN=""
FRPC_URL=""
DO_CHECK=0
DISABLE=0
DRY_RUN=0
APP_DIR="/opt/fmkj/app"
FRP_DIR="/opt/fmkj/frp"
CONFIG="/opt/fmkj/frp/frpc.toml"
UNIT="/etc/systemd/system/fmkj-tunnel.service"

say()  { printf '%s\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --host) HOST="$2"; shift 2 ;;
    --server) SERVER="$2"; shift 2 ;;
    --token) TOKEN="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --bandwidth) BANDWIDTH="$2"; shift 2 ;;
    --frpc) FRPC_BIN="$2"; shift 2 ;;
    --frpc-url) FRPC_URL="$2"; shift 2 ;;
    --app-dir) APP_DIR="$2"; shift 2 ;;
    --check) DO_CHECK=1; shift ;;
    --disable) DISABLE=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) die "不认识的参数：$1" ;;
  esac
done

run() { if [ "$DRY_RUN" = "1" ]; then printf '  [dry-run] %s\n' "$*"; else "$@"; fi; }

if [ "$DISABLE" = "1" ]; then
  run systemctl disable --now fmkj-tunnel.service 2>/dev/null || true
  run rm -f "$UNIT" "$CONFIG"
  run systemctl daemon-reload
  ok "已关闭外网访问（配置与自启已移除）"
  exit 0
fi

[ "$(id -u)" = "0" ] || die "请用 root 运行"
[ -n "$HOST" ] || die "缺少 --host：客户要用的网址主机名，例如 dealer01.example.com"
[ -n "$SERVER" ] || die "缺少 --server：你的穿透服务器地址，例如 tunnel.example.com:17000"
[ -n "$TOKEN" ] || die "缺少 --token：服务器 frps.toml 里的 auth.token"

# 子域名严格校验：只允许字母数字和连字符，避免拼出奇怪的 TOML/Host
printf '%s' "$HOST" | grep -qE '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$' || die "主机名不合法：$HOST"
SERVER_HOST="${SERVER%%:*}"
SERVER_PORT="${SERVER##*:}"
[ "$SERVER_PORT" = "$SERVER" ] && SERVER_PORT="17000"

if [ -z "$PORT" ]; then
  PORT="$(sed -n 's/^FMKJ_PORT=//p' "$APP_DIR/.env" 2>/dev/null | tail -1 | tr -d '"')"
  PORT="${PORT:-8890}"
fi

say "为客户开通外网访问：https://${HOST}（设备本机 ${PORT}，服务器 ${SERVER_HOST}:${SERVER_PORT}）"

# ── 1) frpc 二进制 ────────────────────────────────────────────────────
FRP_VERSION="0.61.0"
if [ -z "$FRPC_BIN" ]; then
  if [ -f "$FRP_DIR/frpc" ]; then
    FRPC_BIN="$FRP_DIR/frpc"
  else
    ARCH="$(uname -m)"; case "$ARCH" in aarch64|arm64) ARCH="arm64" ;; x86_64|amd64) ARCH="amd64" ;; esac
    URL="${FRPC_URL:-https://github.com/fatedier/frp/releases/download/v${FRP_VERSION}/frp_${FRP_VERSION}_linux_${ARCH}.tar.gz}"
    say "  下载 frpc（${ARCH}）…"
    run mkdir -p "$FRP_DIR"
    run bash -c "curl -fsSL '$URL' -o /tmp/frpc.tar.gz && tar xzf /tmp/frpc.tar.gz -C /tmp && cp /tmp/frp_${FRP_VERSION}_linux_${ARCH}/frpc '$FRP_DIR/frpc' && rm -rf /tmp/frpc.tar.gz /tmp/frp_${FRP_VERSION}_linux_${ARCH}"
    FRPC_BIN="$FRP_DIR/frpc"
  fi
fi
# 不管用户给的是哪里的二进制，都放到持久目录再用：
# 指到 /tmp 的话，机器一重启服务就起不来了（踩过）。
if [ "$DRY_RUN" != "1" ] && [ "$FRPC_BIN" != "$FRP_DIR/frpc" ]; then
  mkdir -p "$FRP_DIR"
  cp -f "$FRPC_BIN" "$FRP_DIR/frpc"
  FRPC_BIN="$FRP_DIR/frpc"
fi
[ "$DRY_RUN" = "1" ] || { chmod +x "$FRPC_BIN" && "$FRPC_BIN" -v >/dev/null 2>&1 || die "frpc 跑不起来：$FRPC_BIN"; }
ok "frpc 就位：$FRPC_BIN（持久目录，重启不会丢）"

# ── 2) 写配置 ─────────────────────────────────────────────────────────
if [ "$DRY_RUN" != "1" ]; then
  mkdir -p "$(dirname "$CONFIG")"
  cat > "$CONFIG" <<EOF
# 由 enable-public-access.sh 生成（改它不如重跑脚本）。
serverAddr = "${SERVER_HOST}"
serverPort = ${SERVER_PORT}
auth.token = "${TOKEN}"

[[proxies]]
name = "fmkj-app"
type = "http"
localIP = "127.0.0.1"
localPort = ${PORT}
customDomains = ["${HOST}"]
# 每客户限速（frp 把限速放在每个 proxy 下）：一家占满带宽会把其他客户拖慢。
transport.bandwidthLimit = "${BANDWIDTH}"
EOF
  chmod 600 "$CONFIG"
  ok "配置已写入 $CONFIG"
else
  say "  [dry-run] 写入配置 $CONFIG（${HOST} → 本机 ${PORT}）"
fi

# 先用 frpc 自己的校验器过一遍：配置写错时直接说清楚，而不是装成服务反复重启
if [ "$DRY_RUN" != "1" ]; then
  if ! "$FRPC_BIN" verify -c "$CONFIG" >/dev/null 2>&1; then
    warn "配置校验没过："
    "$FRPC_BIN" verify -c "$CONFIG" 2>&1 | tail -3 | sed 's/^/    /'
    die "配置有问题（见上），已停止。"
  fi
  ok "配置校验通过"
fi

# ── 3) systemd 服务 ──────────────────────────────────────────────────
if [ "$DRY_RUN" != "1" ]; then
  cat > "$UNIT" <<EOF
[Unit]
Description=FMKJ 设备版：外网访问隧道（frpc）
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
ExecStart=${FRPC_BIN} -c ${CONFIG}
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable --now fmkj-tunnel.service >/dev/null 2>&1
  ok "隧道服务已启动并设为开机自启"
else
  say "  [dry-run] 安装并启动 systemd 服务 fmkj-tunnel.service"
fi

# ── 4) 等连接成功 ────────────────────────────────────────────────────
if [ "$DRY_RUN" != "1" ]; then
  READY=0
  for i in $(seq 1 30); do
    if journalctl -u fmkj-tunnel -n 50 --no-pager 2>/dev/null | grep -q "start proxy success"; then READY=1; break; fi
    sleep 1
  done
  if [ "$READY" != "1" ]; then
    warn "30 秒内没看到连接成功，最后几行日志："
    journalctl -u fmkj-tunnel -n 8 --no-pager 2>/dev/null | sed 's/^/    /'
    die "隧道没建起来：检查服务器地址/端口/token，以及设备能不能出网。"
  fi
  ok "隧道已连上服务器"
fi

cat <<EOF

──────────────────────────────────────────────
 开通完成 ✅

  给客户的网址：https://${HOST}
  （服务器上 Caddy 负责 HTTPS 与压缩；域名解析 *.你的域名 指向服务器即可，
    新客户不需要改服务器配置）

  关闭：bash $0 --disable
  看状态：systemctl status fmkj-tunnel
──────────────────────────────────────────────
EOF

if [ "$DO_CHECK" = "1" ] && [ "$DRY_RUN" != "1" ]; then
  NODE_BIN="$(command -v node || echo /opt/fmkj/tools/node/bin/node)"
  if [ -x "$NODE_BIN" ] && [ -f "$APP_DIR/scripts/deploy/check-public-access.mjs" ]; then
    say ""
    "$NODE_BIN" "$APP_DIR/scripts/deploy/check-public-access.mjs" --url "https://${HOST}" || warn "自检有项没过，看上面"
  fi
fi
