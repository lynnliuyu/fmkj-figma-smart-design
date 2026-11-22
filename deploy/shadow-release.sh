#!/usr/bin/env bash
# 影子部署：不停机更新主站（fmkj.top）。
#
# 为什么用影子部署：这台服务器**同时跑着另一个业务**（fanmeng-gateway-*），
# 直接 `docker compose up -d` 会重建容器、短暂中断两个业务。
# 影子部署的做法是：新目录 → 新镜像 → 新端口 → 验证通过 → 改 Caddy 流量。
#
# 用法（在服务器上以 ubuntu 用户执行）：
#   bash deploy/shadow-release.sh                      # 完整发布：构建 → 影子 → 冒烟 → 切流量
#   PAUSE=1 bash deploy/shadow-release.sh              # 只做到「影子就绪」，不切流量
#   bash deploy/shadow-release.sh --cut <端口>         # 只切流量（冒烟在本机跑完后用）
#   bash deploy/shadow-release.sh --rollback <端口>    # 回滚到指定端口
set -euo pipefail

APP_DIR=/opt/fmkj/figma-smart-design        # 当前生产目录（旧版，保留用于回滚）
RELEASES=/opt/fmkj/releases
BACKUPS=/opt/fmkj/backups
CADDY=/opt/fanmeng-gateway/releases/aad2e52/deploy/remote/caddy/gateway.Caddyfile
CADDY_CONTAINER=fanmeng-gateway-edge-caddy-1
STAMP=$(date +%Y%m%d-%H%M)
DEPLOY_DIR=$(cd "$(dirname "$0")" && pwd -P)
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

# ── 只切流量：给 PAUSE=1 之后的第二次调用用 ──────────────────
# 第一次跑（PAUSE=1）建好影子容器并停在「未切流量」，本机冒烟通过后再跑
#   SKIP_SMOKE=1 bash deploy/shadow-release.sh --cut <NEW_PORT>
# 此时不再构建、不再起容器，只改 Caddy 指向。
CUT_ONLY=0
if [[ "${1:-}" == "--cut" ]]; then
  TARGET_PORT=${2:-}
  [[ -n "$TARGET_PORT" ]] || die "--cut 需要一个端口，如 --cut 13029"
  curl -s -o /dev/null --max-time 5 "http://127.0.0.1:$TARGET_PORT/login" \
    || die "127.0.0.1:$TARGET_PORT 上没有服务在监听，拒绝切流量"
  [[ "$TARGET_PORT" == "$CUR_PORT" ]] && { echo "已经在 $TARGET_PORT，无需切换"; exit 0; }
  NEW_PORT=$TARGET_PORT
  CUT_ONLY=1
  # --cut 是**另一次进程**，$STAMP 是新的，算出来的 $APP_CONTAINER 根本不存在。
  # 而第 5.5 步的清理循环靠「跳过 $APP_CONTAINER」保护正在服务的容器 ——
  # 名字对不上就等于没有保护：影子起好超过 5 分钟再切，脚本会**把自己刚切的
  # 线上容器删掉**（2026-11-14 实测：那次只差 3 分钟就踩中）。
  # 所以这里按端口反查真正在服务的容器名。
  APP_CONTAINER=$(sudo docker ps --format '{{.Names}} {{.Ports}}' \
    | awk -v p="127.0.0.1:$TARGET_PORT->" 'index($0,p){print $1; exit}')
  [[ -n "$APP_CONTAINER" ]] || die "找不到监听 $TARGET_PORT 的容器，拒绝切流量"
  echo "  目标容器：$APP_CONTAINER"
fi

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

# --cut 只切流量：跳过备份 / 构建 / 迁移 / 起容器，直接走到第 5 步
if [[ "$CUT_ONLY" != "1" ]]; then

# ── 预检 0：磁盘水位 ──────────────────────────────────
# 2026-11-22 实测：可用只剩 1.1 GB 时脚本照常构建，镜像解包把分区压到 98%，
# 空间不足时在备份、清理和构建前中止。阈值只能往上调。
MIN_FREE_GB=${MIN_FREE_GB:-8}
[[ "$MIN_FREE_GB" =~ ^[0-9]{1,9}$ ]] || die "MIN_FREE_GB 必须是十进制整数，最低 8 GB"
MIN_FREE_GB=$((10#$MIN_FREE_GB))
if (( MIN_FREE_GB < 8 )); then
  echo "  ⚠️  MIN_FREE_GB=${MIN_FREE_GB} 低于安全下限，已按 8 GB 执行（这道检查不允许放宽）" >&2
  MIN_FREE_GB=8
fi
FREE_KB=$(df -Pk "$RELEASES" | awk 'NR==2{print $4}') || die "无法读取发布分区可用空间"
[[ "$FREE_KB" =~ ^[0-9]+$ ]] || die "无法读取发布分区可用空间"
FREE_GB=$(( FREE_KB / 1024 / 1024 ))
log "预检：磁盘水位（可用 ${FREE_KB} KiB / 要求 ≥${MIN_FREE_GB} GB）"
if (( FREE_GB < MIN_FREE_GB )); then
  cat >&2 <<EOF

✗ 磁盘可用空间不足，已中止（生产未受影响，流量未动）。

  当前：${FREE_GB} GB 可用（$(( FREE_KB / 1024 )) MB）
  要求：≥ ${MIN_FREE_GB} GB

  该清什么，按回收量从大到小：
    1. 构建缓存      sudo docker builder prune -f
    2. 旧发布目录    bash deploy/disk-rotate.sh
    3. /tmp 残留     sudo bash deploy/disk-maintenance.sh
    4. 无标签镜像    sudo docker image prune -f
    5. 系统日志      sudo journalctl --vacuum-size=200M

  清理后重新执行本脚本即可。不要用环境变量跳过这道检查。
EOF
  exit 1
fi
echo "  ✅ 空间充足（${FREE_GB} GB）"

log "预检：清理构建缓存（保留 2 GB）"
sudo docker builder prune -f --keep-storage 2GB || die "构建缓存清理失败"

# ── 预检：清掉没有容器挂着的影子网络 ──────────────────
# 每个 release 会建一个 compose 网络（<project>_default），5.5 步只删容器，
# 网络不会跟着消失。攒够 ~28 个就把 Docker 默认地址池吃光，第 3 步直接报：
#   all predefined address pools have been fully subnetted
# 2026-11-14 实测踩到：构建白跑了十分钟才发现。放在最前面，失败得快。
log "预检：清理遗留的影子网络"
for n in $(sudo docker network ls --format '{{.Name}}' \
  | grep -E '^fmkj-shadow-[0-9]{8}-[0-9]{4}_default$' || true); do
  attached=$(sudo docker network inspect "$n" --format '{{len .Containers}}' 2>/dev/null || echo 1)
  if [[ "$attached" == "0" ]]; then
    sudo docker network rm "$n" >/dev/null 2>&1 && echo "  已清理：$n"
  fi
done

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
# 服务器到 GitHub 的链路实测只有几十 KB/s（2026-11-14 单次 --depth 1 clone 跑了
# 十几分钟还没完）。所以支持两条路：
#   · SRC_DIR=<已有源码目录> → 直接 rsync 复用，不联网
#   · 否则 git clone（慢但自包含）
if [[ -n "${SRC_DIR:-}" ]]; then
  [[ -d "$SRC_DIR" ]] || die "SRC_DIR=$SRC_DIR 不存在"
  echo "  复用源码：$SRC_DIR（跳过 git clone）"
  rsync -a --exclude='.git' --exclude='node_modules' --exclude='.next' \
    --exclude='.env' "$SRC_DIR"/ "$REL/src"/
  echo "  版本：$(sha256sum "$REL/src/package.json" | cut -c1-12) (package.json)"
else
  git clone --depth 1 --branch main \
    git@github.com:lynnliuyu/fmkj-figma-smart-design.git "$REL/src"
  echo "  版本：$(git -C "$REL/src" log -1 --format='%h %ad' --date=short)"
fi

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
#
# 2026-11-14 修正：**这台宿主机没装 node/pnpm/playwright**，原来直接
# `node e2e/smoke.mjs` 必然 command not found → 脚本在第 4.5 步中止，
# 表现是「镜像构建完成了但流量没切」。
# 现在宿主机没有 node+playwright 时**不会静默跳过**，而是明确 die 并给出
# 本机隧道跑冒烟的命令；确认通过后再带 SKIP_SMOKE=1 重跑。
log "4.5/7 冒烟验证影子容器（失败则中止，不切流量）"
# 注意：runner 镜像里只有 standalone 产物，没有 playwright，所以**不能**在
# app 容器里跑冒烟。只有宿主机自己装了 node + playwright 才能本地跑。
if [[ "${SKIP_SMOKE:-}" == "1" ]]; then
  echo "  ⚠️  SKIP_SMOKE=1：跳过冒烟（调用方需自行验证）"
elif [[ -f e2e/smoke.mjs ]] && command -v node >/dev/null 2>&1 \
  && node -e 'require("playwright")' >/dev/null 2>&1; then
  SMOKE_BASE="http://127.0.0.1:$NEW_PORT" SMOKE_OUT=/tmp/fmkj-smoke \
  SMOKE_EMAIL="${SMOKE_EMAIL:-}" SMOKE_PASS="${SMOKE_PASS:-}" \
    node e2e/smoke.mjs 2>&1 | tail -25 \
    || die "冒烟未通过，已中止（生产未受影响）"
else
  # 停在「新容器已起、流量未切」状态，把后续命令直接打印出来。
  # PAUSE=1 是**显式选择**：脚本不会假装冒烟跑过了。
  if [[ "${PAUSE:-}" == "1" || "${1:-}" == "--cut" ]]; then
    cat <<JSON
  ⏸  PAUSE=1：影子容器已就绪，流量未切。
     端口 $NEW_PORT（Caddy 仍指向 $CUR_PORT，生产未受影响）

  在本机跑冒烟：
      ssh -f -N -L 19128:127.0.0.1:$NEW_PORT $USER@\$(hostname -I | awk '{print \$1}')
      SMOKE_BASE=http://127.0.0.1:19128 SMOKE_OUT=/tmp/fmkj-smoke node e2e/smoke.mjs

  通过后切流量：
      SKIP_SMOKE=1 bash deploy/shadow-release.sh --cut $NEW_PORT
JSON
    exit 0
  fi
  die "宿主机没有 node + playwright，无法自动冒烟。请改在**本机**跑：
      ssh -f -N -L 19128:127.0.0.1:$NEW_PORT ubuntu@<服务器>
      SMOKE_BASE=http://127.0.0.1:19128 node e2e/smoke.mjs
    或带 PAUSE=1 重跑本脚本，让它停在「新容器就绪、流量未切」，
    确认通过后再用 SKIP_SMOKE=1 切流量（生产未受影响）"
fi

fi  # CUT_ONLY：以上是「构建 + 起影子 + 冒烟」阶段，--cut 时整段跳过

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
#
# 保留策略：**当前 + 上一版**。$CUR_PORT 那个容器就是上一版生产，脚本最后打印的
# 回滚命令指向它 —— 之前把它一起清了，等于「回滚命令」是一句空话
# （2026-11-14 实测：切完 13028 就没了，只剩 4 天前的 13001）。
log "5.5/7 清理更早的影子容器（保留当前与上一版）"
for c in $(sudo docker ps -a --format '{{.Names}}' | grep -E '^fmkj-shadow-[0-9]{8}-[0-9]{4}-app-1$' || true); do
  [[ "$c" == "$APP_CONTAINER" ]] && continue
  # 双保险：任何正在监听新端口的容器都是「刚切过去的线上容器」，一律不动。
  # 名字保护已经够了，但名字是推出来的，端口是事实。
  if sudo docker port "$c" 2>/dev/null | grep -q ":$NEW_PORT\$"; then
    echo "  保留：$c（正在服务 $NEW_PORT）"
    continue
  fi
  if sudo docker port "$c" 2>/dev/null | grep -q ":$CUR_PORT\$"; then
    echo "  保留：$c（上一版，回滚目标 $CUR_PORT）"
    continue
  fi
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

if [[ "$CUT_ONLY" == "1" ]]; then
  echo "  当前容器：$APP_CONTAINER"
else
  echo "  本次容器：$APP_CONTAINER（compose project: $PROJECT）"
fi
# ── 7. 轮转旧发布目录（保留当前与上一版，其余按时间清）──────────
# 2026-11-22 实测：releases/ 攒了 12 个目录、另有 19 个手工发布时代的 src-*
# 暂存目录共 2.5 GB，从来没人清过。放在切流成功之后做，失败也不影响线上。
log "7/7 轮转旧发布目录"
KEEP_RELEASES=2 bash "$DEPLOY_DIR/disk-rotate.sh" || \
  echo "  ⚠️  轮转失败（不影响线上）"

log "完成。回滚命令：bash deploy/shadow-release.sh --rollback $CUR_PORT"
