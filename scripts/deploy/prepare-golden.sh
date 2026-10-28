#!/usr/bin/env bash
#
# 把一台已经装好的设备做成「母盘」（在母机上执行，执行完自动关机）。
#
# 为什么需要它：直接把装好的系统做成镜像发给下一个客户，镜像里带着上一台设备的会话密钥、
# 数据库密码、客户数据、附件和日志。这个脚本把这些**全部清干净**，并打上「首次开机要初始化」
# 的标记；新设备第一次开机时由 fmkj-first-boot.service 生成自己的新密钥、重建数据库。
#
# 用法（母机上，root）：
#   bash scripts/deploy/prepare-golden.sh --yes
#   bash scripts/deploy/prepare-golden.sh --dry-run      # 只看会删什么
#
# 可选：--dir /opt/fmkj/app  --project-name fmkj  --keep-logs  --no-poweroff
set -euo pipefail

DIR="/opt/fmkj/app"
PROJECT="fmkj"
MARKER=".fmkj-first-boot-pending"
DRY_RUN=0
ASSUME_YES=0
POWEROFF=1
KEEP_LOGS=0

say()  { printf '%s\n' "$*"; }
step() { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --dir) DIR="$2"; shift 2 ;;
    --project-name) PROJECT="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --yes) ASSUME_YES=1; shift ;;
    --no-poweroff) POWEROFF=0; shift ;;
    --keep-logs) KEEP_LOGS=1; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) die "不认识的参数：$1" ;;
  esac
done

[ "$(id -u)" = "0" ] || die "请用 root 运行"
[ -f "$DIR/.env.production" ] || die "$DIR 下没有装好的设备版（缺 .env.production）"

run() {
  if [ "$DRY_RUN" = "1" ]; then printf '  [dry-run] %s\n' "$*"; else "$@"; fi
}

read_env() {
  local key="$1" file="$2"
  [ -f "$file" ] || return 0
  sed -n "s/^${key}=//p" "$file" | tail -1 | tr -d '"'
}

DB_VOLUME="$(read_env FMKJ_DB_VOLUME "$DIR/.env")"; DB_VOLUME="${DB_VOLUME:-fmkj-v3-db}"
UPLOADS_VOLUME="$(read_env FMKJ_UPLOADS_VOLUME "$DIR/.env")"; UPLOADS_VOLUME="${UPLOADS_VOLUME:-fmkj-v3-uploads}"
APP_CONTAINER="$(read_env FMKJ_APP_CONTAINER "$DIR/.env")"; APP_CONTAINER="${APP_CONTAINER:-fmkj-v3}"
DB_CONTAINER="$(read_env FMKJ_DB_CONTAINER "$DIR/.env")"; DB_CONTAINER="${DB_CONTAINER:-fmkj-v3-db}"

say "母盘准备：$DIR（项目 $PROJECT）"
say "会清掉：容器、数据库卷 $DB_VOLUME、附件卷 $UPLOADS_VOLUME、部署状态、备份、密钥。"
if [ "$ASSUME_YES" != "1" ] && [ "$DRY_RUN" != "1" ]; then
  printf '确认继续？输入 yes：'
  read -r answer
  [ "$answer" = "yes" ] || die "已取消"
fi

step "1/6 停掉这套服务"
run bash -c "cd '$DIR' && docker compose -p '$PROJECT' -f docker-compose.appliance.yml down --remove-orphans || true"
ok "已停"

step "2/6 删掉数据卷（客户数据、附件都不带走）"
# 先确认这两个卷确实是本项目建的。同一台机器上可能还有另一套（测试或演示），
# 按名字盲删会把别人的数据删掉——真机踩过同类事故，所以这里宁可停下。
for volume in "$DB_VOLUME" "$UPLOADS_VOLUME"; do
  owner="$(docker volume inspect "$volume" --format '{{index .Labels "com.docker.compose.project"}}' 2>/dev/null || echo "")"
  if [ -z "$owner" ]; then
    warn "卷 $volume 不存在（跳过）"
  elif [ "$owner" != "$PROJECT" ]; then
    die "卷 $volume 属于项目「$owner」，不是本项目「$PROJECT」。为免误删别人的数据，已停止。
    确认要清的是哪一套：给 --project-name 传对的项目名，或检查 $DIR/.env 里的卷名配置。"
  else
    run docker volume rm "$volume" || warn "卷 $volume 没删掉"
  fi
done
ok "数据卷已清"

step "3/6 清掉运行痕迹与备份"
run rm -rf "$DIR/deploy-state" "$DIR/backups"
if [ "$KEEP_LOGS" != "1" ]; then
  run rm -f "$DIR"/*.log "$DIR"/updater-log.txt 2>/dev/null || true
fi
run rm -f "$DIR/update.lock" "$DIR"/.env.bak-* "$DIR"/docker-compose.appliance.yml.bak-* 2>/dev/null || true
ok "痕迹已清"

step "4/6 清掉这台机器的密钥（新设备第一次开机会生成自己的）"
run bash -c "sed -i '/^AUTH_SECRET=/d; /^POSTGRES_PASSWORD=/d; /^DATABASE_URL=/d' '$DIR/.env.production'"
run bash -c "umask 077; printf 'DATABASE_URL=postgresql://fmkj:PLACEHOLDER@postgres:5432/fmkj\\n' >> '$DIR/.env.production'"
ok "密钥已删（首次开机重新生成）"

step "5/6 清掉 SSH 主机密钥与更新状态"
run rm -f /etc/ssh/ssh_host_* 2>/dev/null || true
run rm -f /opt/fmkj/tools/*.log 2>/dev/null || true
if [ -f "$DIR/scripts/deploy/.fmkj-image-id" ]; then run rm -f "$DIR/scripts/deploy/.fmkj-image-id"; fi
ok "SSH 主机密钥已删（首次开机 ssh-keygen -A 重建）"

step "6/6 打上首次开机标记"
run bash -c "date -u +'%Y-%m-%dT%H:%M:%SZ' > '$DIR/$MARKER'"
ok "已标记：新设备第一次开机会自己生成密钥、建库、起服务"

cat <<EOF

──────────────────────────────────────────────
 母盘准备完成 ✅

  接下来：关机后把这张卡/这块 eMMC 读成镜像（用你现有的刷机工具），
  再刷到新设备上。新设备第一次开机会自动：
    · 生成新的会话密钥与数据库密码
    · 清 SSH 主机密钥
    · 重建数据库并跑迁移
    · 起服务，并把首次开机标记去掉

  之后客户打开 http://<设备IP>:3000，会引导他自己设置管理员账号。
──────────────────────────────────────────────
EOF

if [ "$POWEROFF" = "1" ] && [ "$DRY_RUN" != "1" ]; then
  say "5 秒后关机，现在可以拔电取消…"
  sleep 5
  poweroff
fi
