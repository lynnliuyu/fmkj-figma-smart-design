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
# ⚠️ 每次部署用**独立的 compose project 名**，容器名才不会撞车。
#
# 2026-11-10 踩过：project 名固定为 `fmkj-shadow` → 容器名永远是 `fmkj-shadow-app-1`，
# 于是第二次部署时 `up -d` **重建的正是线上正在跑的那个容器** ——
# 新容器还没验证，旧容器就已经没了，线上出现一段「无人监听」的窗口（实测 502）。
# 用 STAMP 做后缀后，每次部署是全新的一组容器，旧容器不受影响；
# 切完流量再显式清掉旧 project。
PROJECT="fmkj-shadow-$STAMP"
APP_CONTAINER="$PROJECT-app-1"

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
  log "回滚：把 Caddy 指回 127.0.0.1:$ROLLBACK_TO"

  # 先确认目标端口**真的有人监听** —— 「容器存在」不等于「服务在跑」。
  # （2026-11-09 踩过：以为 13000 是好的，其实那个端口早就没服务了。）
  if ! curl -s -o /dev/null --max-time 5 "http://127.0.0.1:$ROLLBACK_TO/login"; then
    die "127.0.0.1:$ROLLBACK_TO 上没有服务在监听，回滚目标无效。请用 --rollback <其他端口>"
  fi

  # Caddy 的 Caddyfile 是**只读 bind mount**，容器内改不了；必须改宿主机再重启容器。
  # reload 不够 —— bind mount 的 inode 在宿主机文件被替换后就和容器脱钩了。
  sudo cp "$CADDY" "$CADDY.bak-rb-$STAMP"
  sudo sed "s|reverse_proxy 127\.0\.0\.1:$CUR_PORT|reverse_proxy 127.0.0.1:$ROLLBACK_TO|" "$CADDY" | sudo tee /tmp/caddy.rb > /dev/null
  sudo cat /tmp/caddy.rb | sudo tee "$CADDY" > /dev/null

  if ! sudo docker exec "$CADDY_CONTAINER" caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
    sudo cat "$CADDY.bak-rb-$STAMP" | sudo tee "$CADDY" > /dev/null
    die "Caddy 配置校验失败，已还原"
  fi
  sudo docker restart "$CADDY_CONTAINER" >/dev/null
  sleep 6

  log "已回滚。验证："
  curl -s -o /dev/null -w '  https://fmkj.top/login → %{http_code}\n' https://fmkj.top/login
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
sudo docker compose -p "$PROJECT" --profile tools build 2>&1 | tail -20

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
# 三处必须 !override，缺一个都会出事（都是 2026-11-09 实际踩到的）：
#  1. ports    → 不 override 就绑不上影子端口
#  2. networks → 不 override 会被丢进 compose 自建网络，连不上生产库（空库！）
#  3. volumes  → ⚠️ 最隐蔽：compose 用 project 名建**自己的空卷**
#      （fmkj-shadow_media），容器里 /data/media 是空的，
#      页面能开、不报错，但**所有上传图片 404**（产品图、户型图、AI 生图全挂）。
#      必须显式挂生产卷 fmkj_media / fmkj_desktop。
cat > "$REL/override.yml" <<YAML
services:
  app:
    ports: !override
      - "127.0.0.1:$NEW_PORT:3000"
    networks: !override
      - fmkj_prod
    volumes: !override
      - shadow_media:/data/media
      - shadow_desktop:/data/desktop
networks:
  fmkj_prod:
    external: true
    name: $PROD_NET
volumes:
  shadow_media:
    external: true
    name: fmkj_media
  shadow_desktop:
    external: true
    name: fmkj_desktop
YAML
sudo docker compose -p "$PROJECT" -f docker-compose.yml -f "$REL/override.yml" up -d --no-deps app

# ── 3.5 验证容器真的接上了生产资源（不能只看容器起来）────────
# 这几条是"看得见的证据"：网络不对 → 数据空；卷不对 → 图片 404。
log "3.5/7 验证容器接线"
_net=$(sudo docker inspect "$APP_CONTAINER" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' 2>/dev/null)
[[ "$_net" == *"$PROD_NET"* ]] || die "影子容器没接生产网络（当前：$_net），中止"
echo "  ✅ 网络：$_net"
_img=$(sudo docker exec "$APP_CONTAINER" sh -c 'ls /data/media 2>/dev/null | wc -l' 2>/dev/null || echo 0)
if [[ "${_img:-0}" -lt 10 ]]; then
  die "素材卷是空的（只有 ${_img} 个文件）—— 容器挂到了 compose 自建的空卷，图片会全 404"
fi
echo "  ✅ 素材：$_img 个文件"

# ── 4. 等健康 ─────────────────────────────────────────
log "4/7 等影子容器就绪"
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$NEW_PORT/login" || true)
  [[ "$code" == "200" ]] && { echo "  ✅ 就绪（${i} 次探测）"; break; }
  [[ $i -eq 60 ]] && die "影子容器 300 秒内未就绪，已中止（生产未受影响）"
  sleep 5
done

# ── 4.5 冒烟验证影子容器（⚠️ 切流量前的最后一道闸）────────
# 为什么必须在**真服务器**上跑：本地库没有素材，页面上「图片全 404」这类
# 只在生产才出现的问题，本地冒烟永远测不出来（2026-11-09 就是这么漏过去的：
# 影子容器挂了空素材卷，产品图全 404，但页面不报错、接口也返回 200）。
log "4.5/7 冒烟验证影子容器（失败则中止，不切流量）"
SMOKE_BASE="http://127.0.0.1:$NEW_PORT" \
SMOKE_EMAIL="${SMOKE_EMAIL:-}" SMOKE_PASS="${SMOKE_PASS:-}" \
  node e2e/smoke.mjs 2>&1 | tail -25 \
  || die "冒烟未通过，已中止（生产未受影响）"

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

# ── 5.5 清理上一版容器（切完流量、确认新容器在跑之后）────────
# 用独立 project 名后，旧容器不会在切换前被重建 —— 但也不会自动消失，
# 留着会一直占端口和一点内存。这里显式清掉「不是当前 project」的那些。
#
# 只清 project 名以 fmkj-shadow- 开头、且不是本次 $PROJECT 的容器；
# 手工创建的 `fmkj-shadow-app`（无 compose 标签）和 `fmkj-db-1` 一律不碰。
log "5.5/7 清理上一版影子容器"
for c in $(sudo docker ps -a --format '{{.Names}}' | grep -E '^fmkj-shadow-[0-9]{8}-[0-9]{4}-app-1$' || true); do
  [[ "$c" == "$APP_CONTAINER" ]] && continue
  # 只清 5 分钟以前的（避免误清并发的另一次部署）
  started=$(sudo docker inspect "$c" --format '{{.State.StartedAt}}' 2>/dev/null || true)
  if [[ -n "$started" ]]; then
    age=$(( $(date +%s) - $(date -d "$started" +%s 2>/dev/null || echo 0) ))
    if [[ $age -gt 300 ]]; then
      sudo docker rm -f "$c" >/dev/null 2>&1 && echo "  已清理：$c"
    fi
  fi
done
echo "  ✅ 清理完成"

# ── 6. 验证 ───────────────────────────────────────────
log "6/7 验证线上"
for p in /login / /projects; do
  printf '  https://fmkj.top%s → %s\n' "$p" \
    "$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "https://fmkj.top$p")"
done

echo "  本次容器：$APP_CONTAINER（compose project: $PROJECT）"
log "完成。回滚命令：bash deploy/shadow-release.sh --rollback $CUR_PORT"
