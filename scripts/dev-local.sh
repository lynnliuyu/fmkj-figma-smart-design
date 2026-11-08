#!/usr/bin/env bash
# 本地开发一键启动。
#
# 解决的问题：手动起 dev 时容易忘记把 src/payload.config.ts 指向自托管配置，
# 或忘记传 DATABASE_URI，导致页面报
#   "Environment ID could not be resolved. Set FIGMA_EID or initialize the project."
# 这个脚本把「改配置 → 起服务 → 退出时还原」全包了。
#
# 用法：bash scripts/dev-local.sh [端口]
set -euo pipefail

PORT="${1:-3000}"
PG_PORT="${FMKJ_PG_PORT:-55432}"
DB_URI="${FMKJ_DB_URI:-postgres://fmkj@127.0.0.1:${PG_PORT}/fmkj}"

cd "$(dirname "$0")/.."

# 1) 检查数据库
if ! nc -z 127.0.0.1 "$PG_PORT" 2>/dev/null; then
  echo "❌ PostgreSQL 没在 127.0.0.1:${PG_PORT} 上监听。"
  echo "   先按 LOCAL-DEV.md 第一节起库，或用 FMKJ_PG_PORT 指定端口。"
  exit 1
fi

# 2) 备份并替换 payload 配置（等价于 Dockerfile 的做法）
BACKUP="$(mktemp)"
cp src/payload.config.ts "$BACKUP"
restore() {
  cp "$BACKUP" src/payload.config.ts
  rm -f "$BACKUP"
  echo ""
  echo "已还原 src/payload.config.ts"
}
trap restore EXIT INT TERM

printf "export { default } from './payload.selfhost.config'\n" > src/payload.config.ts

# 3) 起服务
export PAYLOAD_CONFIG_PATH=src/payload.selfhost.config.ts
export PAYLOAD_SECRET="${PAYLOAD_SECRET:-dev-local-secret-key-please-change}"
export DATABASE_URI="$DB_URI"
export PUBLIC_URL="${PUBLIC_URL:-http://localhost:${PORT}}"
export NEXT_TELEMETRY_DISABLED=1

echo "▶ 数据库: $DB_URI"
echo "▶ 地址:   http://localhost:${PORT}"
echo "▶ 账号:   demo@fmkj.local / demo12345"
echo ""

exec pnpm exec next dev --port "$PORT" --hostname 0.0.0.0
