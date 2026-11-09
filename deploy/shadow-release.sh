#!/usr/bin/env bash
# 影子部署：不停机更新主站（fmkj.top）。
#
# 为什么用影子部署：这台服务器**同时跑着另一个业务**（fanmeng-gateway-*），
# 直接 `docker compose up -d` 会重建容器、短暂中断两个业务。
# 影子部署的做法是：新目录 → 新镜像 → 新端口 → 验证通过 → 改 Caddy 流量。
#
# 用法（在服务器上以 ubuntu 用户执行）：
#   bash deploy/shadow-release.sh [--rollback]
set -euo pipefail

APP_DIR=/opt/fmkj/figma-smart-design        # 当前生产目录
RELEASES=/opt/fmkj/releases
BACKUPS=/opt/fmkj/backups
CADDY=/opt/fanmeng-gateway/releases/aad2e52/deploy/remote/caddy/gateway.Caddyfile
STAMP=$(date +%Y%m%d-%H%M)
NEW_PORT=13001                              # 影子端口；生产是 13000

log() { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }
die() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ── 回滚 ──────────────────────────────────────────────
if [[ "${1:-}" == "--rollback" ]]; then
  log "回滚：把 Caddy 指回 $APP_DIR（13000）"
  sudo sed -i "s|reverse_proxy 127.0.0.1:$NEW_PORT|reverse_proxy 127.0.0.1:13000|" "$CADDY"
  sudo caddy validate --config "$CADDY" >/dev/null 2>&1 || die "Caddy 配置校验失败"
  sudo systemctl reload caddy
  log "已回滚。验证："
  curl -s -o /dev/null -w '  https://fmkj.top → %{http_code}\n' https://fmkj.top/login
  exit 0
fi

# ── 0. 备份数据库 ─────────────────────────────────────
log "0/6 备份数据库"
mkdir -p "$BACKUPS"
sudo docker exec fmkj-db-1 pg_dump -U fmkj fmkj 2>/dev/null \
  | gzip > "$BACKUPS/fmkj-db-$STAMP.sql.gz" \
  || die "数据库备份失败，中止"
echo "  $(du -h "$BACKUPS/fmkj-db-$STAMP.sql.gz" | cut -f1)"

# ── 1. 准备新目录 ─────────────────────────────────────
REL="$RELEASES/$STAMP"
log "1/6 准备新版本目录 $REL"
sudo mkdir -p "$REL"
sudo chown "$(id -u):$(id -g)" "$REL"
git clone --depth 1 --branch main \
  git@github.com:lynnliuyu/fmkj-figma-smart-design.git "$REL/src"
echo "  版本：$(git -C "$REL/src" log -1 --format='%h %ad' --date=short)"

# 沿用生产 .env —— **绝不重新生成 PAYLOAD_SECRET**（改了所有人都要重新登录）
sudo cp "$APP_DIR/.env" "$REL/src/.env"
sudo chown "$(id -u):$(id -g)" "$REL/src/.env"

# ── 2. 构建镜像 ───────────────────────────────────────
log "2/6 构建镜像（.env 里的 PUBLIC_URL 会写进前端，必须正确）"
cd "$REL/src"
sudo docker compose -p fmkj-shadow build 2>&1 | tail -20

# ── 3. 起影子容器（端口 $NEW_PORT）────────────────────
log "3/6 起影子容器，监听 127.0.0.1:$NEW_PORT"
# 用 override 文件改端口，不动 tracked compose
cat > "$REL/override.yml" <<YAML
services:
  app:
    ports: !override
      - "127.0.0.1:$NEW_PORT:3000"
YAML
sudo docker compose -p fmkj-shadow -f docker-compose.yml -f "$REL/override.yml" up -d app

# ── 4. 等健康 ─────────────────────────────────────────
log "4/6 等影子容器就绪"
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$NEW_PORT/login" || true)
  [[ "$code" == "200" ]] && { echo "  ✅ 就绪（${i} 次探测）"; break; }
  [[ $i -eq 60 ]] && die "影子容器 300 秒内未就绪，已中止（生产未受影响）"
  sleep 5
done

# ── 5. 切流量 ─────────────────────────────────────────
log "5/6 切 Caddy 流量 → 127.0.0.1:$NEW_PORT"
sudo cp "$CADDY" "$CADDY.bak-$STAMP"
sudo sed -i "s|reverse_proxy 127.0.0.1:13000|reverse_proxy 127.0.0.1:$NEW_PORT|" "$CADDY"
if ! sudo caddy validate --config "$CADDY" >/dev/null 2>&1; then
  sudo cp "$CADDY.bak-$STAMP" "$CADDY"
  die "Caddy 配置校验失败，已回滚配置（生产未受影响）"
fi
sudo systemctl reload caddy

# ── 6. 验证 ───────────────────────────────────────────
log "6/6 验证线上"
for p in /login / /projects; do
  printf '  https://fmkj.top%s → %s\n' "$p" \
    "$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "https://fmkj.top$p")"
done

log "完成。回滚命令：bash deploy/shadow-release.sh --rollback"
