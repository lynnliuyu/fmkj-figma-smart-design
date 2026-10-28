#!/usr/bin/env bash
#
# 新设备第一次开机时的初始化（由 fmkj-first-boot.service 调用，平时什么都不做）。
#
# 母盘里没有密钥、没有数据库；这一步负责让每台设备「长得一样但密钥各不相同」：
#   生成新的会话密钥与数据库密码 → 清 SSH 主机密钥 → 重建数据库并迁移 → 起服务 → 去掉标记
#
# 没打标记（例如正常安装的设备）时直接退出，重复开机也不会再动数据。
#
# 手动跑（排障）：
#   bash /opt/fmkj/app/scripts/deploy/first-boot.sh
#   bash /opt/fmkj/app/scripts/deploy/first-boot.sh --dry-run
set -euo pipefail

DIR="/opt/fmkj/app"
PROJECT="fmkj"
MARKER=".fmkj-first-boot-pending"
LOG="/var/log/fmkj-first-boot.log"
DRY_RUN=0

log() { printf '[%s] %s\n' "$(date '+%F %T')" "$*" | tee -a "$LOG"; }
die() { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --dir) DIR="$2"; shift 2 ;;
    --project-name) PROJECT="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    *) die "不认识的参数：$1" ;;
  esac
done

if [ ! -f "$DIR/$MARKER" ]; then
  log "没有首次开机标记，跳过（这台设备不需要初始化）"
  exit 0
fi

[ "$(id -u)" = "0" ] || die "请用 root 运行"

run() {
  if [ "$DRY_RUN" = "1" ]; then printf '  [dry-run] %s\n' "$*"; else "$@"; fi
}

gen_secret() { openssl rand -base64 32 2>/dev/null || head -c 32 /dev/urandom | base64; }

log "第一次开机初始化开始（$DIR，项目 $PROJECT）"

# ── 1) 生成这台设备自己的密钥 ─────────────────────────────────────────
if [ "$DRY_RUN" != "1" ]; then
  AUTH_SECRET="$(gen_secret | tr -d '\n')"
  DB_PASSWORD="$(gen_secret | tr -d '\n/+=' | cut -c1-24)"
  umask 077
  # 母盘里这几行已经被删掉，这里统一写回（同一键只保留一条）。
  sed -i '/^AUTH_SECRET=/d; /^POSTGRES_PASSWORD=/d; /^DATABASE_URL=/d' "$DIR/.env.production"
  {
    printf 'DATABASE_URL=postgresql://fmkj:%s@postgres:5432/fmkj\n' "$DB_PASSWORD"
    printf 'POSTGRES_PASSWORD=%s\n' "$DB_PASSWORD"
    printf 'AUTH_SECRET=%s\n' "$AUTH_SECRET"
  } >> "$DIR/.env.production"
  chmod 600 "$DIR/.env.production"
fi
log "已生成新的会话密钥与数据库密码"

# ── 2) SSH 主机密钥：克隆出来的设备不能共用身份 ──────────────────────
run rm -f /etc/ssh/ssh_host_* 2>/dev/null || true
run ssh-keygen -A >/dev/null 2>&1 || true
run systemctl restart ssh 2>/dev/null || run systemctl restart sshd 2>/dev/null || true
log "SSH 主机密钥已重建"

# ── 3) 请求目录权限（应用以 uid 1001 运行）────────────────────────────
run mkdir -p "$DIR/deploy-state/requests"
run chown -R 1001:1001 "$DIR/deploy-state/requests"

# ── 4) 重建数据库并迁移 ──────────────────────────────────────────────
compose() { ( cd "$DIR" && docker compose -p "$PROJECT" -f docker-compose.appliance.yml "$@" ); }
run compose up -d postgres
if [ "$DRY_RUN" != "1" ]; then
  for i in $(seq 1 60); do
    compose ps postgres 2>/dev/null | grep -qi healthy && break
    [ "$i" = "60" ] && die "数据库 60 秒还没就绪"
    sleep 1
  done
fi
log "数据库已就绪，开始建表"
run compose run --rm app node scripts/run-migration.mjs
log "表结构已建好"

# ── 5) 起应用 ────────────────────────────────────────────────────────
run compose up -d
if [ "$DRY_RUN" != "1" ]; then
  READY=0
  PORT="$(sed -n 's/^FMKJ_PORT=//p' "$DIR/.env" | tail -1 | tr -d '"')"
  PORT="${PORT:-8890}"
  for i in $(seq 1 90); do
    if curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/login" 2>/dev/null; then READY=1; break; fi
    sleep 1
  done
  [ "$READY" = "1" ] || die "应用 90 秒没起来，看 docker compose logs app"
fi
log "应用已启动"

# ── 6) 去掉标记：下次开机不再重复初始化 ──────────────────────────────
run rm -f "$DIR/$MARKER"
log "第一次开机初始化完成：这台设备是全新的，管理员由客户第一次打开页面时设置"
