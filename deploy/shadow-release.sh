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

APP_DIR=/opt/fmkj/figma-smart-design        # 当前生产目录（旧版，保留用于回滚）
RELEASES=/opt/fmkj/releases
BACKUPS=/opt/fmkj/backups
CADDY=/opt/fanmeng-gateway/releases/aad2e52/deploy/remote/caddy/gateway.Caddyfile
CADDY_CONTAINER=fanmeng-gateway-edge-caddy-1
STAMP=$(date +%Y%m%d-%H%M)

# ── 端口自动探测 ──────────────────────────────────────
# 不要硬编码 13000/13001：每次发布端口都会变（13000 → 13001 → 13002 …）。
# 从 Caddy 当前配置里读出正在用的端口，新端口 = 当前 + 1（在 13000–13099 之间循环）。
CUR_PORT=$(sudo grep -oE 'reverse_proxy 127\.0\.0\.1:130[0-9]{2}' "$CADDY" | head -1 | grep -oE '[0-9]{5}')
CUR_PORT=${CUR_PORT:-13000}
NEW_PORT=$(( CUR_PORT == 13099 ? 13000 : CUR_PORT + 1 ))

log() { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }
die() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ── 回滚 ──────────────────────────────────────────────
if [[ "${1:-}" == "--rollback" ]]; then
  ROLLBACK_TO=${2:-13000}
  log "回滚：把 Caddy 指回 127.0.0.1:$ROLLBACK_TO（旧容器 fmkj-app-1）"
  # Caddy 的 Caddyfile 是**只读 bind mount**，容器内改不了；必须改宿主机再重启容器。
  # reload 不够 —— bind mount 的 inode 在宿主机文件被替换后就和容器脱钩了。
  sudo sed "s|reverse_proxy 127\.0\.0\.1:$CUR_PORT|reverse_proxy 127.0.0.1:$ROLLBACK_TO|" "$CADDY" > /tmp/caddy.rb
  sudo cat /tmp/caddy.rb > "$CADDY"
  sudo docker start fmkj-app-1 2>/dev/null || true
  sudo docker restart "$CADDY_CONTAINER"
  sleep 6
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
log "2/7 构建镜像（.env 里的 PUBLIC_URL 会写进前端，必须正确）"
cd "$REL/src"
# 必须带 --profile tools：迁移需要 pnpm + payload CLI，runner 镜像里没有它们
sudo docker compose -p fmkj-shadow --profile tools build 2>&1 | tail -20

# ── 2.5 跑数据库迁移（⚠️ 绝不能跳过）─────────────────
# 为什么单独一步：新版本常带 schema 变更（如 projects.display_profile）。
# 不跑迁移，页面能开、路由也正常，**但字段不存在 → 功能静默失效**。
# 2026-11-09 首次踩到：这个脚本原本压根没有迁移步骤。
log "2.5/7 跑数据库迁移"
PROD_NET=$(sudo docker inspect fmkj-db-1 --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' 2>/dev/null)
PROD_NET=${PROD_NET:-fmkj_default}
PW=$(sudo grep -oE '^POSTGRES_PASSWORD=.*' "$APP_DIR/.env" | cut -d= -f2)
SECRET=$(sudo grep -oE '^PAYLOAD_SECRET=.*' "$APP_DIR/.env" | cut -d= -f2-)
sudo docker run --rm --network "$PROD_NET" \
  -e DATABASE_URI="postgres://fmkj:${PW}@db:5432/fmkj" \
  -e PAYLOAD_SECRET="$SECRET" \
  -e NODE_ENV=production \
  fmkj-tools:latest pnpm exec payload migrate 2>&1 | tail -8 \
  || die "迁移失败，中止（生产未受影响）"
echo "  迁移完成"

# ⚠️ 起容器必须 --no-deps + external network，否则 compose 会自建一个空库
#    2026-11-09 踩到：新容器连上 fmkj-shadow-db-1（空库），差点切过去。
# ── 3. 起影子容器（端口 $NEW_PORT）────────────────────
log "3/7 起影子容器，监听 127.0.0.1:$NEW_PORT"
# 用 override 文件改端口，不动 tracked compose
cat > "$REL/override.yml" <<YAML
services:
  app:
    ports: !override
      - "127.0.0.1:$NEW_PORT:3000"
    # 必须挂到生产库所在网络，且用 --no-deps 阻止 compose 另起一个 db
    networks: !override
      - fmkj_prod
networks:
  fmkj_prod:
    external: true
    name: $PROD_NET
YAML
sudo docker compose -p fmkj-shadow -f docker-compose.yml -f "$REL/override.yml" up -d --no-deps app

# ── 4. 等健康 ─────────────────────────────────────────
log "4/7 等影子容器就绪"
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$NEW_PORT/login" || true)
  [[ "$code" == "200" ]] && { echo "  ✅ 就绪（${i} 次探测）"; break; }
  [[ $i -eq 60 ]] && die "影子容器 300 秒内未就绪，已中止（生产未受影响）"
  sleep 5
done

# ── 5. 切流量 ─────────────────────────────────────────
log "5/7 切 Caddy 流量：$CUR_PORT → $NEW_PORT"
sudo cp "$CADDY" "$CADDY.bak-$STAMP"

# 三个必须注意的点（都是 2026-11-09 上线时踩过的）：
#   1. Caddyfile 是**只读 bind mount**，容器内 sed 会报 Resource busy → 必须改宿主机
#   2. `sed -i` 会重建文件（换 inode），容器的 mount 就脱钩了 → 用「重定向到临时文件
#      再 cat 回原路径」保持 inode 不变
#   3. 即便如此，**reload 也不够**：bind mount 的目录项缓存不会自动刷新，
#      必须 `docker restart` Caddy 容器。重启约 1–2 秒中断。
sudo sed "s|reverse_proxy 127\.0\.0\.1:$CUR_PORT|reverse_proxy 127.0.0.1:$NEW_PORT|" "$CADDY" > /tmp/caddy.new
sudo cat /tmp/caddy.new > "$CADDY"

# 校验（Caddy 在容器里，宿主机没有 caddy 命令）
if ! sudo docker exec "$CADDY_CONTAINER" caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
  sudo cat "$CADDY.bak-$STAMP" > "$CADDY"
  die "Caddy 配置校验失败，已还原（生产未受影响）"
fi
sudo docker restart "$CADDY_CONTAINER" >/dev/null
sleep 6

# ── 6. 验证 ───────────────────────────────────────────
log "6/7 验证线上"
for p in /login / /projects; do
  printf '  https://fmkj.top%s → %s\n' "$p" \
    "$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "https://fmkj.top$p")"
done

log "完成。回滚命令：bash deploy/shadow-release.sh --rollback"
