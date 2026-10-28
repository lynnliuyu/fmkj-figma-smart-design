#!/usr/bin/env bash
#
# 把 GitHub 上构建好的设备镜像搬到本机仓库，设备照旧从本机仓库升级。
#
# 为什么需要这一步：构建放在 GitHub 上（不占本机内存），但设备拉的是本机仓库
# （10.0.0.235:5443）。GitHub 的镜像是私有的，所以本机要先登录一次：
#
#   docker login ghcr.io -u <你的 GitHub 用户名>      # 密码填一个能读包的令牌(PAT)
#
# 之后每次构建完跑：
#   bash scripts/deploy/sync-image-from-ghcr.sh --version v0.3.15
set -euo pipefail

VERSION=""
SOURCE="ghcr.io/lynnliuyu/fmkj-v3"
TARGET="10.0.0.235:5443/fmkj-v3"

while [ $# -gt 0 ]; do
  case "$1" in
    --version) VERSION="$2"; shift 2 ;;
    --source) SOURCE="$2"; shift 2 ;;
    --target) TARGET="$2"; shift 2 ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "不认识的参数：$1" >&2; exit 1 ;;
  esac
done

say() { printf '%s\n' "$*"; }
die() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ -n "$VERSION" ] || die "缺少 --version：要搬哪个版本，例如 --version v0.3.15"
case "$VERSION" in v*) ;; *) die "版本号要以 v 开头，例如 v0.3.15" ;; esac

command -v docker >/dev/null 2>&1 || die "这台机器没有 docker 命令。"

say "从 GitHub 镜像仓库取 $SOURCE:$VERSION"
if ! docker pull "$SOURCE:$VERSION"; then
  die "拉不下来。多半是没登录，或令牌没有读包的权限：
    docker login ghcr.io -u <你的 GitHub 用户名>     # 密码填 PAT（需要 read:packages）
  刚构建完的版本要等 Actions 跑完（几分钟到半小时）。"
fi

ARCH="$(docker image inspect "$SOURCE:$VERSION" --format '{{.Architecture}}')"
[ "$ARCH" = "arm64" ] || die "这个镜像的架构是 $ARCH，设备要的是 arm64——构建时平台选错了。"

say "转到本机仓库 $TARGET:$VERSION"
docker tag "$SOURCE:$VERSION" "$TARGET:$VERSION"

# 推到本机仓库这一步走 Docker 守护进程，而守护进程会把仓库流量都塞给自己的代理
# （docker info 里的 http.docker.internal:3128，转发到系统代理）。系统代理一开，
# 局域网地址就连不上，表现是 "TLS handshake timeout"（2026-10-23 实测）。
# 所以守护进程推失败时，改用容器里的 skopeo 直连推送（容器的网络不经过那个代理）。
if ! docker push "$TARGET:$VERSION"; then
  say ""
  say "守护进程推不上去（多半是代理挡住了局域网地址），改用 skopeo 直连推送…"
  command -v docker >/dev/null || die "没有 docker"
  TAR="$(mktemp -t fmkj-image-XXXXXX).tar"
  say "  导出镜像（不经过网络）…"
  docker save "$SOURCE:$VERSION" -o "$TAR" || die "导出失败"
  docker pull -q quay.io/skopeo/stable:latest >/dev/null 2>&1 || true
  if ! docker run --rm -v "$(dirname "$TAR"):/work" \
      -e HTTP_PROXY= -e HTTPS_PROXY= -e http_proxy= -e https_proxy= -e NO_PROXY='*' -e no_proxy='*' \
      quay.io/skopeo/stable:latest copy --dest-tls-verify=false \
      "docker-archive:/work/$(basename "$TAR")" "docker://$TARGET:$VERSION"; then
    rm -f "$TAR"
    die "skopeo 也推不上去。检查本机仓库是否在跑（docker ps | grep registry），或临时关掉系统代理再试。"
  fi
  rm -f "$TAR"
  say ""
  say "推好了。想以后不用走这条路：在 Docker Desktop → 设置 → Resources → Proxies 里"
  say "把 $TARGET 的地址加进「绕过代理」名单（或临时关掉系统代理）。"
fi

say ""
say "──────────────────────────────────────────────"
say " 搬好了 ✅  $TARGET:$VERSION（架构 $ARCH）"
say ""
say " 设备上升级：管理员页面 → 系统 → 检查更新 → 升到 $VERSION"
say " 或者在没有管理员界面的设备上跑："
say "   cd /opt/fmkj/app && /opt/fmkj/tools/node/bin/node scripts/deploy/update-local.mjs --to $VERSION --repository $TARGET --compose-file docker-compose.appliance.yml"
say "     --to $VERSION --repository $TARGET --compose-file docker-compose.appliance.yml"
say "──────────────────────────────────────────────"

# 旧版本镜像占空间，留最近 5 个（本机 Docker 磁盘不大）。
KEEP=5
OLD="$(docker images "$TARGET" --format '{{.Tag}}' | grep -E '^v[0-9]' | sort -V | head -n -$KEEP || true)"
if [ -n "$OLD" ]; then
  say ""
  say "清理本机旧镜像（保留最近 $KEEP 个）："
  for tag in $OLD; do
    docker rmi "$TARGET:$tag" >/dev/null 2>&1 && say "  已删 $TARGET:$tag"
  done
fi
