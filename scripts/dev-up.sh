#!/usr/bin/env bash
#
# 本地开发「一键起」：库没跑就起库 → 起 dev 服务。
#
# 为什么需要它：
# 本地环境没起来时，验证一个改动只能走「生产构建 → 打包 → 上传 → 服务器 docker build
# → 切流量」，一轮十几分钟。起本地库之后，改一行到看见效果只要几秒。
#
# 与 scripts/dev-local.sh 的分工：
#   dev-local.sh —— 只管起 dev 服务，假设库已经在跑，库没跑就报错退出
#   dev-up.sh    —— 本脚本：先确保库在跑（找不到二进制会给出明确指引），再交给 dev-local.sh
#
# 用法：
#   bash scripts/dev-up.sh            # 起库 + 起 dev（:3000）
#   bash scripts/dev-up.sh 3001       # 指定端口
#   bash scripts/dev-up.sh --db-only  # 只起库，不起服务（给别的工具用）
set -euo pipefail

cd "$(dirname "$0")/.."

PORT="${1:-3000}"
DB_ONLY=false
[ "$PORT" = "--db-only" ] && { DB_ONLY=true; PORT=3000; }

PG_PORT="${FMKJ_PG_PORT:-55432}"
DATA_DIR="${FMKJ_PG_DATA:-$HOME/.fmkj-dev-db}"

# ── 1. 找 postgres 二进制 ────────────────────────────────────────────────
# 本机没有 brew 装的 postgres，实际可用的是 paperclip 自带的 embedded-postgres。
# 路径里的版本号会随 paperclip 升级变化，所以用 glob 找而不是写死。
find_pgbin() {
  # ① 显式指定优先
  if [ -n "${PGDIR:-}" ] && [ -x "$PGDIR/pg_ctl" ]; then echo "$PGDIR"; return 0; fi
  # ② 系统 PATH
  if command -v pg_ctl >/dev/null 2>&1; then dirname "$(command -v pg_ctl)"; return 0; fi
  # ③ paperclip embedded-postgres（本机实际情况）
  local hit
  hit=$(ls -d "$HOME"/.paperclip/cli/installs/npm/*/node_modules/@embedded-postgres/darwin-*/native/bin 2>/dev/null | tail -1)
  if [ -n "$hit" ] && [ -x "$hit/pg_ctl" ]; then echo "$hit"; return 0; fi
  # ④ 常见安装位置
  for d in /opt/homebrew/opt/postgresql*/bin /usr/local/opt/postgresql*/bin; do
    [ -x "$d/pg_ctl" ] && { echo "$d"; return 0; }
  done
  return 1
}

if ! PGBIN=$(find_pgbin); then
  cat <<'EOF'
❌ 找不到 PostgreSQL 二进制（pg_ctl / initdb）。

  本机没有 brew 版 postgres，通常可用的是 paperclip 自带的：
    ~/.paperclip/cli/installs/npm/*/node_modules/@embedded-postgres/darwin-*/native/bin

  三种解决办法（任选）：
    1) 装一个：brew install postgresql@18
    2) 显式指定路径：PGDIR=/path/to/bin bash scripts/dev-up.sh
    3) 只做静态检查（不用库）：pnpm exec tsc --noEmit && pnpm test
EOF
  exit 1
fi

echo "▸ PostgreSQL 二进制：$PGBIN"
"$PGBIN/pg_ctl" --version | sed 's/^/  /'

# ── 2. 库没跑就起 ───────────────────────────────────────────────────────
if nc -z 127.0.0.1 "$PG_PORT" 2>/dev/null; then
  echo "▸ 库已在 127.0.0.1:${PG_PORT} 上跑，跳过启动"
else
  if [ ! -d "$DATA_DIR" ]; then
    echo "▸ 首次初始化数据目录：$DATA_DIR"
    "$PGBIN/initdb" -D "$DATA_DIR" -U fmkj --auth=trust -E UTF8 >/dev/null
  fi
  echo "▸ 启动库（端口 ${PG_PORT}）…"
  "$PGBIN/pg_ctl" -D "$DATA_DIR" -o "-p $PG_PORT -k /tmp" -l /tmp/pg-fmkj.log start >/dev/null
  # pg_ctl start 是异步的，等端口真的能连上
  for _ in $(seq 1 30); do
    nc -z 127.0.0.1 "$PG_PORT" 2>/dev/null && break
    sleep 0.5
  done
  if ! nc -z 127.0.0.1 "$PG_PORT" 2>/dev/null; then
    echo "❌ 库没起来，看日志：/tmp/pg-fmkj.log"; tail -20 /tmp/pg-fmkj.log; exit 1
  fi
  echo "  ✅ 库已就绪（日志 /tmp/pg-fmkj.log）"

fi

# ⚠️ 刻意**不自动跑迁移**。
#
# 两个原因（都是实测踩出来的）：
#
# 1. paperclip 自带的 embedded-postgres **只有 initdb / pg_ctl / postgres**，
#    没有 `psql` / `createdb` —— 用它们做「库在不在」的探测必然失败。
#
# 2. 本地库是 dev 模式 `payload` 动态 push 出来的（137 张表已就绪），
#    直接跑 `payload migrate` 会弹交互确认：
#      ? It looks like you've run Payload in dev mode … Would you like to proceed? (y/N)
#    非交互执行就卡死在这儿。而本地**本来就不需要迁移**（push 已建表）。
#
# 所以：只提示，不动手。库真为空时让用户按 LOCAL-DEV.md 手动处理。
if [ "$DB_ONLY" = true ]; then :; fi

if ! PGBIN_QUERY=$(node -e '
  const path = require("path")
  let pg
  try { pg = require("pg") } catch {
    const { execSync } = require("child_process")
    const dir = execSync("ls -d node_modules/.pnpm/pg@*/node_modules/pg | head -1").toString().trim()
    pg = require(path.resolve(dir))
  }
  const c = new pg.Client({ host: "127.0.0.1", port: Number(process.env.FMKJ_PG_PORT || 55432), user: "fmkj", database: "fmkj" })
  c.connect().then(async () => {
    const r = await c.query("select count(*)::int as n from pg_tables where schemaname = $1", ["public"])
    console.log(r.rows[0].n)
    await c.end()
  }).catch(() => { console.log("0"); process.exit(0) })
' 2>/dev/null); then PGBIN_QUERY=0; fi

if [ "$PGBIN_QUERY" -lt 10 ]; then
  cat <<'EOF'
⚠️ 库好像还是空的（表数 < 10）。首次需要建表，请按 LOCAL-DEV.md 第二节：

  export PAYLOAD_CONFIG_PATH=src/payload.selfhost.config.ts
  export PAYLOAD_SECRET=dev-local-secret-key-please-change
  export DATABASE_URI="postgres://fmkj@127.0.0.1:55432/fmkj"
  pnpm exec payload migrate

（或者直接 `pnpm dev` 让 Payload 以 dev 模式 push 建表。）
EOF
else
  echo "▸ 库里有 $PGBIN_QUERY 张表，直接可用"
fi

if [ "$DB_ONLY" = true ]; then
  echo "▸ 只起库，退出。（停库：$PGBIN/pg_ctl -D $DATA_DIR stop）"
  exit 0
fi

# ── 3. 起 dev 服务（交给 dev-local.sh，它负责改 payload.config 与还原）────
echo "▸ 启动 dev 服务（:${PORT}）…"
exec bash scripts/dev-local.sh "$PORT"
