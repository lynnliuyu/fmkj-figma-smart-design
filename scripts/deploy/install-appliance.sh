#!/usr/bin/env bash
#
# 一台新设备的一键装机（在设备上以 root 运行）。
#
# 它做的九件事：检查环境 → 建目录 → 生成配置与密钥 → 装宿主机 Node → 拉镜像
#   → 起数据库 → 建表 → 起应用 → 装更新管家与每日检查 → 自检并打印交付信息。
#
# 管理员账号**不在这里创建**：设备装好后第一次打开页面，会让客户自己设
# （客户不希望我们把他们的密码经手一遍）。
#
# 用法：
#   bash install-appliance.sh --registry 10.0.0.235:5443/fmkj-v3 --version v0.3.4
#   bash install-appliance.sh --registry ... --version ... --dry-run     # 只看会做什么
#   bash install-appliance.sh --registry ... --version ... --repair      # 已装过的设备上重跑
#
# 可选参数：
#   --dir <目录>        安装目录，默认 /opt/fmkj/app
#   --port <端口>       对外端口，默认 3000
#   --tools <目录>      宿主机 Node 放哪，默认 /opt/fmkj/tools
#   --node-tarball <文件>  离线装机包里的 node tar.xz（没有就联网下载）
#   --project-name <名> compose 项目名，默认 fmkj（同一台机器上装第二套做测试时改掉）
#   --public-host <主机名>  客户要用的外网网址（例如 dealer01.你的域名.com）；给了这一步会顺手开通外网访问
#   --tunnel-server <地址>  你的穿透服务器（例如 tunnel.example.com:17000）
#   --tunnel-token <令牌>   frps.toml 里的 auth.token
#   --no-systemd        不装 systemd 服务（在非 systemd 环境里测试用）
#   --skip-pull         跳过拉镜像（本地已有镜像时）
#   --no-install-docker 机器上没 Docker 时不要自动装（默认会自动装）
#   --hostname <名字>   给这台设备起个能在路由器里认出来的名字（默认自动取 fmkj-xxxxxx）
#   --keep-hostname     不改主机名（默认会改）
set -euo pipefail

DIR="/opt/fmkj/app"
TOOLS="/opt/fmkj/tools"
PORT="8890"
PROJECT="fmkj"
INSTALL_DOCKER=1
HOSTNAME_ARG=""
SET_HOSTNAME=1
PUBLIC_HOST=""
TUNNEL_SERVER=""
TUNNEL_TOKEN=""
REGISTRY=""
VERSION=""
NODE_TARBALL=""
REPAIR=0
DRY_RUN=0
NO_SYSTEMD=0
SKIP_PULL=0

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

say()  { printf '%s\n' "$*"; }
step() { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --dir) DIR="$2"; shift 2 ;;
    --tools) TOOLS="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --project-name) PROJECT="$2"; shift 2 ;;
    --public-host) PUBLIC_HOST="$2"; shift 2 ;;
    --tunnel-server) TUNNEL_SERVER="$2"; shift 2 ;;
    --tunnel-token) TUNNEL_TOKEN="$2"; shift 2 ;;
    --registry) REGISTRY="$2"; shift 2 ;;
    --version) VERSION="$2"; shift 2 ;;
    --node-tarball) NODE_TARBALL="$2"; shift 2 ;;
    --repair) REPAIR=1; shift ;;
    --no-install-docker) INSTALL_DOCKER=0; shift ;;
    --hostname) HOSTNAME_ARG="$2"; shift 2 ;;
    --keep-hostname) SET_HOSTNAME=0; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --no-systemd) NO_SYSTEMD=1; shift ;;
    --skip-pull) SKIP_PULL=1; shift ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) die "不认识的参数：$1（--help 看用法）" ;;
  esac
done

[ -n "$REGISTRY" ] || die "缺少 --registry <镜像仓库>/fmkj-v3（例如 10.0.0.235:5443/fmkj-v3）"
[ -n "$VERSION" ] || die "缺少 --version <版本>（例如 v0.3.4）"
IMAGE="${REGISTRY}:${VERSION}"
REGISTRY_HOST="${REGISTRY%%/*}"

run() {
  if [ "$DRY_RUN" = "1" ]; then printf '  [dry-run] %s\n' "$*"; else "$@"; fi
}

# 主机名：默认每台刷出来都叫 armbian，装到几台在路由器里就分不清谁是谁。
# 这里自动取一个能认出来的名字（也可以用 --hostname 指定，或 --keep-hostname 不动）。
set_device_hostname() {
  [ "$SET_HOSTNAME" = "1" ] || { say "  按 --keep-hostname 保留当前主机名：$(hostname)"; return 0; }
  local name="$HOSTNAME_ARG"
  if [ -z "$name" ]; then
    local serial=""
    [ -r /proc/device-tree/serial-number ] && serial="$(tr -d '\0' < /proc/device-tree/serial-number)"
    if [ -z "$serial" ] && [ -r /etc/machine-id ]; then serial="$(cut -c1-10 /etc/machine-id)"; fi
    [ -z "$serial" ] && serial="$(date +%s | tail -c 6)"
    name="fmkj-$(printf '%s' "$serial" | tr 'A-Z' 'a-z' | tr -cd 'a-z0-9' | cut -c1-8)"
  fi
  name="$(printf '%s' "$name" | tr 'A-Z' 'a-z')"
  echo "$name" | grep -qE '^[a-z0-9][a-z0-9-]{0,30}$' || { warn "主机名不合法（只用小写字母、数字、连字符）：$name，跳过"; return 0; }
  if [ "$(hostname)" = "$name" ]; then ok "主机名已经是 $name"; return 0; fi
  if [ "$DRY_RUN" = "1" ]; then say "  [dry-run] hostnamectl set-hostname $name（当前是 $(hostname)）"; return 0; fi
  hostnamectl set-hostname "$name" 2>/dev/null || { printf '%s\n' "$name" > /etc/hostname; hostname "$name" 2>/dev/null || true; }
  # /etc/hosts 里 127.0.1.1 那行要跟着改，否则 sudo 之类会卡一下。
  if grep -qE '^127\.0\.1\.1' /etc/hosts 2>/dev/null; then
    sed -i "s/^127\.0\.1\.1.*/127.0.1.1\t$name/" /etc/hosts
  else
    printf '127.0.1.1\t%s\n' "$name" >> /etc/hosts
  fi
  ok "主机名已设为 $name（路由器/局域网里会显示这个名字）"
}

step "1/9 检查环境"
[ "$(id -u)" = "0" ] || die "请用 root 运行（systemd 与 docker 都需要）"
# 刷完系统现装的机器通常还没有 Docker。以前这里直接报错让运维手工装一遍，
# 现在顺手装上（除非显式 --no-install-docker）：刷完系统就是一条命令到底。
if ! command -v docker >/dev/null 2>&1; then
  if [ "$INSTALL_DOCKER" = "0" ]; then
    die "这台机器没装 docker。先装好再来跑装机（Armbian：apt install docker.io docker-compose-plugin）。"
  fi
  command -v apt-get >/dev/null 2>&1 || die "这台机器没有 apt（不是 Debian/Armbian 系），请手动装好 Docker 再跑装机。"
  say "  这台机器还没有 Docker，顺手装上（docker.io + compose 插件，约 1-2 分钟）"
  if [ "$DRY_RUN" = "1" ]; then
    say "  [dry-run] apt-get update && apt-get install -y docker.io docker-compose && systemctl enable --now docker"
    say "            （compose 的包名按发行版不同：Debian 13/Armbian 26.x 里叫 docker-compose，"
    say "              别的发行版可能叫 docker-compose-plugin——脚本两个都试）"
  else
    apt-get update -qq
    # compose 的包名各发行版不一致，实测：Debian 13 / Armbian 26.x 上是 docker-compose（自带 v2 插件），
    # 老一些的发行版才有 docker-compose-plugin。两个都试一遍，谁装得上用谁。
    INSTALLED_COMPOSE=""
    for pkgs in "docker.io docker-compose" "docker.io docker-compose-plugin"; do
      # shellcheck disable=SC2086
      if DEBIAN_FRONTEND=noninteractive apt-get install -y -qq $pkgs >/dev/null 2>&1; then INSTALLED_COMPOSE="$pkgs"; break; fi
    done
    [ -n "$INSTALLED_COMPOSE" ] || die "Docker 没装上。手动执行 apt install docker.io docker-compose 后再来跑装机。"
    systemctl enable --now docker >/dev/null 2>&1 || true
    command -v docker >/dev/null 2>&1 || die "Docker 装了但命令还找不到，重开会话再跑。"
    docker compose version >/dev/null 2>&1 || die "Docker 装上了，但 \"docker compose\" 不能用（装到的是老版 v1）。请按 Docker 官方文档装 compose v2 插件后再来。"
    ok "Docker $(docker version --format '{{.Server.Version}}' 2>/dev/null || echo '?') + compose $(docker compose version --short 2>/dev/null || echo '?') 已装好（包：$INSTALLED_COMPOSE）"
  fi
fi
# dry-run 时可能根本没装 docker（上面只打印了要装什么），别在这里误判成故障。
if [ "$DRY_RUN" != "1" ]; then
  docker info >/dev/null 2>&1 || die "docker 在，但连不上守护进程（docker info 失败）。"
fi
ARCH="$(uname -m)"
[ "$ARCH" = "aarch64" ] || warn "这台机器是 $ARCH，不是 aarch64——镜像要匹配架构，确认一下。"
AVAIL_KB="$(df -Pk "$(dirname "$DIR")" 2>/dev/null | awk 'NR==2{print $4}' || echo 0)"
[ "${AVAIL_KB:-0}" -gt 3000000 ] || warn "可用磁盘不足 3GB，镜像和备份可能放不下（当前约 $(( ${AVAIL_KB:-0} / 1024 ))MB）。"
if [ "$DRY_RUN" = "1" ] && ! command -v docker >/dev/null 2>&1; then
  ok "架构 $ARCH（Docker 将在正式执行时装上）"
else
  ok "docker $(docker version --format '{{.Server.Version}}' 2>/dev/null || echo '?')，架构 $ARCH"
fi

# 主机名独立于 Docker：放在这里，两种情况下都会执行（dry-run 也能看到会改成什么）。
set_device_hostname

# dry-run 遇到没装 Docker 的机器：后面的步骤全都要 docker，看不到也没有意义，
# 说清楚就停（正式执行会先装上 Docker 再继续）。
if [ "$DRY_RUN" = "1" ] && ! command -v docker >/dev/null 2>&1; then
  say ""
  ok "dry-run 到此为止：这台机器还没有 Docker。正式执行时会先装上（docker.io + compose 插件，包名按发行版自动选），再往下走 2-9 步。"
  exit 0
fi

# compose 会「继承」机器上已有容器的项目名（实测：在同一台设备上装第二套时，它把正式那套
# 当成了同一个项目去重建）。所以这里显式指定项目名，并且在容器名被别的项目占用时直接拒绝。
APP_CONTAINER="${FMKJ_APP_CONTAINER:-fmkj-v3}"
EXISTING="$(docker ps -a --filter "name=^/${APP_CONTAINER}$" --format '{{.Label "com.docker.compose.project"}}' | head -1)"
if [ -n "$EXISTING" ] && [ "$EXISTING" != "$PROJECT" ]; then
  die "容器名 ${APP_CONTAINER} 已经被另一个项目（${EXISTING}）占用。
    这台机器上已经有一套设备版在跑。要么用 --project-name 与 --dir 装到别处做测试，
    要么先在原来那套的目录里停掉它。"
fi

ALREADY=0
[ -f "$DIR/.env.production" ] && ALREADY=1
if [ "$ALREADY" = "1" ] && [ "$REPAIR" != "1" ]; then
  die "$DIR 下已经有一套安装（见到 .env.production）。
    重装/修复请加 --repair（它会保留现有密码与密钥，只补齐缺的东西）；
    确实要全部重来就先手动把 $DIR 移走。"
fi

step "2/9 建目录并放好编排与脚本"
run mkdir -p "$DIR" "$DIR/deploy-state/requests" "$TOOLS"
for file in docker-compose.appliance.yml docker-compose.appliance-external-db.yml; do
  [ -f "$HERE/$file" ] || die "装机包里缺少 $file（请用发布包，或把仓库里的这两个文件放到脚本旁边）"
  run cp -f "$HERE/$file" "$DIR/"
done
[ -d "$HERE/scripts/deploy" ] || die "装机包里缺少 scripts/deploy（宿主机侧脚本）"
run mkdir -p "$DIR/scripts"
run cp -rf "$HERE/scripts/." "$DIR/scripts/"
chmod +x "$DIR"/scripts/*.mjs "$DIR"/scripts/deploy/*.mjs 2>/dev/null || true
[ -d "$HERE/deploy/systemd" ] && { run mkdir -p "$DIR/deploy"; run cp -rf "$HERE/deploy/systemd" "$DIR/deploy/"; }
ok "$DIR 就绪"

step "3/9 生成配置与密钥（已存在的不覆盖）"
gen_secret() { openssl rand -base64 32 2>/dev/null || head -c 32 /dev/urandom | base64; }

if [ ! -f "$DIR/.env.production" ]; then
  POSTGRES_PASSWORD="$(gen_secret | tr -d '\n/+=' | cut -c1-24)"
  AUTH_SECRET="$(gen_secret | tr -d '\n')"
  run bash -c "umask 077; cat > '$DIR/.env.production' <<EOF
# 由装机脚本生成于 $(date '+%Y-%m-%d %H:%M:%S')。这个文件含密钥，不要外传、不要进版本库。
DATABASE_URL=postgresql://fmkj:${POSTGRES_PASSWORD}@postgres:5432/fmkj
DATABASE_SSL=false
POSTGRES_USER=fmkj
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=fmkj
AUTH_SECRET=${AUTH_SECRET}
AUTH_DEV_MODE=false
FILE_STORAGE=local
FMKJ_STORAGE_ROOT=/data/uploads
PRODUCTS_TABLE=products
EOF"
  ok "已生成 .env.production（数据库密码与会话密钥都是随机生成，没经过任何人手里）"
else
  ok ".env.production 已存在，保留不动"
fi

CA_SOURCE="/etc/docker/certs.d/${REGISTRY_HOST}/ca.crt"
if [ -f "$CA_SOURCE" ] && [ ! -f "$DIR/registry-ca.crt" ]; then
  run cp "$CA_SOURCE" "$DIR/registry-ca.crt"
  ok "自签仓库的 CA 已复制给宿主机脚本使用"
fi

if [ ! -f "$DIR/.env" ]; then
  run bash -c "cat > '$DIR/.env' <<EOF
# 编排与宿主机脚本读这个文件。
FMKJ_IMAGE=${IMAGE}
FMKJ_VERSION=${VERSION}
POSTGRES_IMAGE=postgres:17-alpine
FMKJ_BIND=0.0.0.0
FMKJ_PORT=${PORT}
# 固定项目名：否则 compose 可能从机器上已有的容器继承另一个项目名（会误动别的部署）。
COMPOSE_PROJECT_NAME=${PROJECT}
# 版本从哪里问（更新管家与每日检查都读这里）。
FMKJ_REGISTRY=${REGISTRY_HOST}
FMKJ_REGISTRY_REPOSITORY=${REGISTRY##*/}
FMKJ_REPOSITORY=${REGISTRY}
EOF"
  [ -f "$DIR/registry-ca.crt" ] && run bash -c "echo 'NODE_EXTRA_CA_CERTS=${DIR}/registry-ca.crt' >> '$DIR/.env'"
  # 同一台机器上装第二套（测试/演示）时，容器名与卷名要一起写进配置，
  # 否则后面的脚本按默认名去删卷，会把正式那套的数据删掉。
  for pair in "FMKJ_APP_CONTAINER:${FMKJ_APP_CONTAINER:-}" "FMKJ_DB_CONTAINER:${FMKJ_DB_CONTAINER:-}" \
              "FMKJ_UPLOADS_VOLUME:${FMKJ_UPLOADS_VOLUME:-}" "FMKJ_DB_VOLUME:${FMKJ_DB_VOLUME:-}"; do
    key="${pair%%:*}"; value="${pair#*:}"
    [ -n "$value" ] && run bash -c "echo '${key}=${value}' >> '$DIR/.env'"
  done
  ok "已生成 .env（版本、端口、仓库地址）"
else
  run bash -c "sed -i 's|^FMKJ_IMAGE=.*|FMKJ_IMAGE=${IMAGE}|; s|^FMKJ_VERSION=.*|FMKJ_VERSION=${VERSION}|' '$DIR/.env'"
  ok ".env 已存在，只把版本更新为 ${VERSION}"
fi

step "4/9 宿主机侧 Node（跑更新脚本要用）"
NODE_BIN="$TOOLS/node/bin/node"
if [ -x "$NODE_BIN" ]; then
  ok "已有 $("$NODE_BIN" -v)"
elif command -v node >/dev/null 2>&1 && [ "$(node -e 'console.log(process.versions.node.split(".")[0])')" -ge 22 ]; then
  NODE_BIN="$(command -v node)"
  ok "系统自带的 node $(node -v) 够用"
else
  NODE_VER="v22.23.4"
  if [ -n "$NODE_TARBALL" ] && [ -f "$NODE_TARBALL" ]; then
    run mkdir -p "$TOOLS"
    run tar -xJf "$NODE_TARBALL" -C "$TOOLS"
    run mv "$TOOLS/node-${NODE_VER}-linux-arm64" "$TOOLS/node"
  else
    say "  下载 Node ${NODE_VER}（约 20MB）…"
    run bash -c "mkdir -p '$TOOLS' && cd '$TOOLS' && curl -fsSLO https://nodejs.org/dist/${NODE_VER}/node-${NODE_VER}-linux-arm64.tar.xz && tar -xJf node-${NODE_VER}-linux-arm64.tar.xz && rm -f node-${NODE_VER}-linux-arm64.tar.xz && mv node-${NODE_VER}-linux-arm64 node"
  fi
  [ "$DRY_RUN" = "1" ] || ok "已安装 $("$NODE_BIN" -v)"
fi

step "5/9 拉镜像"
if [ "$SKIP_PULL" = "1" ]; then
  ok "按要求跳过"
else
  run docker pull "$IMAGE"
  run docker pull "${POSTGRES_IMAGE:-postgres:17-alpine}" || warn "postgres 镜像没拉下来，起库时 compose 会再试一次"
  ok "镜像就位：$IMAGE"
fi

COMPOSE="$DIR/docker-compose.appliance.yml"
# 显式 -p：不让 compose 从机器上已有的容器「继承」项目名（那会把正式那套一起动）。
compose() { ( cd "$DIR" && docker compose -p "$PROJECT" -f "$COMPOSE" "$@" ); }

step "6/9 起数据库"
run compose up -d postgres
if [ "$DRY_RUN" != "1" ]; then
  for i in $(seq 1 60); do
    if compose ps postgres 2>/dev/null | grep -qi healthy; then ok "数据库就绪（${i}s）"; break; fi
    [ "$i" = "60" ] && die "数据库 60 秒还没就绪，看：cd $DIR && docker compose logs postgres"
    sleep 1
  done
fi

step "7/9 建表（迁移）"
run compose run --rm app node scripts/run-migration.mjs
ok "表结构已是最新"

step "8/9 起应用并装更新管家"
run compose up -d
if [ "$NO_SYSTEMD" = "1" ]; then
  warn "按要求跳过 systemd（这台设备不会被守护、也不能点按钮更新）"
else
  for unit in fmkj-first-boot.service fmkj-updater.service fmkj-update-check.service fmkj-update-check.timer; do
    [ -f "$DIR/deploy/systemd/$unit" ] && run cp -f "$DIR/deploy/systemd/$unit" "/etc/systemd/system/$unit"
  done
  run systemctl daemon-reload
  # 首次开机初始化：正常安装的设备没有「待初始化」标记，它会空转；母盘刷出来的设备靠它
  # 生成自己的密钥并建库。
  run systemctl enable fmkj-first-boot.service
  run systemctl enable --now fmkj-updater.service
  run systemctl enable --now fmkj-update-check.timer
  ok "更新管家与每日检查已开机自启"
fi

step "9/9 自检"
if [ "$DRY_RUN" = "1" ]; then
  ok "dry-run：跳过自检"
else
  READY=0
  for i in $(seq 1 60); do
    if curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/login" 2>/dev/null; then READY=1; break; fi
    sleep 1
  done
  [ "$READY" = "1" ] || die "应用 60 秒内没起来，看：cd $DIR && docker compose logs app --tail 50"
  ok "应用已响应"

  SETUP_STATE="$(curl -fsS "http://127.0.0.1:${PORT}/api/setup" 2>/dev/null || echo '{}')"
  case "$SETUP_STATE" in
    *'"needsSetup":true'*) ok "这台设备还没有管理员——第一次打开页面会引导客户自己设置" ;;
    *'"needsSetup":false'*) ok "设备已有管理员（修复模式，没有动账号）" ;;
    *) warn "读不到初始化状态：$SETUP_STATE" ;;
  esac

  SMOKE_OK=1
  if [ -x "$NODE_BIN" ] && [ -f "$DIR/scripts/deploy/smoke-appliance.mjs" ]; then
    "$NODE_BIN" "$DIR/scripts/deploy/smoke-appliance.mjs" --base "http://127.0.0.1:${PORT}" --expect-setup || SMOKE_OK=0
  fi
  if [ "$SMOKE_OK" != "1" ]; then
    printf '\n\033[31m✗ 自检没过，先别交付。\033[0m逐条看上面的 ✗；设备已经在跑，客户可以先试用，但别发给客户。\n' >&2
    exit 1
  fi
fi

# 买了「公网访问」的客户：顺手把穿透配好，装完直接能拿到网址
if [ -n "$PUBLIC_HOST" ]; then
  if [ -z "$TUNNEL_SERVER" ] || [ -z "$TUNNEL_TOKEN" ]; then
    warn "给了 --public-host 但缺 --tunnel-server 或 --tunnel-token，跳过外网开通"
  elif [ "$DRY_RUN" = "1" ]; then
    say "  [dry-run] 开通外网访问：$PUBLIC_HOST → $TUNNEL_SERVER"
  else
    step "开通外网访问"
    bash "$HERE/scripts/deploy/enable-public-access.sh" \
      --host "$PUBLIC_HOST" --server "$TUNNEL_SERVER" --token "$TUNNEL_TOKEN" \
      --port "$PORT" --app-dir "$DIR" --frpc-url "${FRPC_URL:-}" --check || warn "外网开通没成功，设备本身已经装好，可以稍后再跑 enable-public-access.sh"
  fi
fi

IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}' || hostname -I 2>/dev/null | awk '{print $1}')"
cat <<EOF

──────────────────────────────────────────────
 装机完成 ✅

  客户怎么用：浏览器打开  http://${IP:-<设备IP>}:${PORT}
              第一次打开会让你设置管理员账号（名字、邮箱、密码），设完就能开始用。
              放到浏览器书签里，以后客户就用这个地址。

  以后怎么更新：管理员 → 系统 → 系统健康 → 「检查有没有新版本」→「立即更新」。
              前端不用敲命令；命令兜底：
              cd ${DIR} && ${NODE_BIN} scripts/deploy/update-local.mjs --to <版本> \\
                --repository ${REGISTRY} --compose-file docker-compose.appliance.yml

  备份在哪：  ${DIR}/backups/appliance/（每次更新前自动备份）
  出问题看：  cd ${DIR} && docker compose logs app --tail 100
              ${DIR}/deploy-state/updater-log.txt
──────────────────────────────────────────────
EOF
