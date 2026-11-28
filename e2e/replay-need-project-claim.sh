#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
port=${QA_APP_PORT:?Choose a free loopback port in QA_APP_PORT}
[[ $port =~ ^[1-9][0-9]{3,4}$ && $port -lt 65536 && $port != 55432 ]]
if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null; then
  printf 'QA_APP_PORT is already in use\n' >&2
  exit 1
fi
out=${1:?Pass an evidence directory for this run}
mkdir -p "$out"
out=$(cd "$out" && pwd)
[[ ! -e "$out/api-results.jsonl" ]]

server_pid=
pg_id=
cleanup() {
  if [[ -n $server_pid ]]; then kill "$server_pid" 2>/dev/null || true; fi
  if [[ -n $pg_id ]]; then docker stop "$pg_id" >/dev/null || true; fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

export PAYLOAD_CONFIG_PATH=src/payload.selfhost.config.ts PAYLOAD_DB_PUSH=false
export NEXT_TELEMETRY_DISABLED=1
export PUBLIC_URL="http://127.0.0.1:$port" PAYLOAD_SECRET="$(openssl rand -hex 32)"
export QA_BASE_URL="$PUBLIC_URL" QA_SALES_PASSWORD="$(openssl rand -hex 20)"
export NEW_PASSWORD="$QA_SALES_PASSWORD"
export MEDIA_DIR="$out/media"
pg_password=$(openssl rand -hex 20)
pg_id=$(docker run --rm -d -e POSTGRES_USER=eevee -e POSTGRES_DB=eevee \
  -e POSTGRES_PASSWORD="$pg_password" -p 127.0.0.1::5432 postgres:17-trixie)
pg_port=$(docker port "$pg_id" 5432/tcp | awk -F: '{print $NF}')
[[ $pg_port =~ ^[0-9]+$ && $pg_port != 55432 ]]
export DATABASE_URI="postgres://eevee:$pg_password@127.0.0.1:$pg_port/eevee"
for i in $(seq 1 25); do
  if docker exec "$pg_id" pg_isready -U eevee -d eevee >/dev/null 2>&1; then break; fi
  sleep 1
done

git rev-parse HEAD | tee "$out/sha.txt"
pnpm exec payload migrate > "$out/migrate.log" 2>&1
for letter in a b; do
  pnpm exec payload run --input "{\"scriptPath\":\"scripts/set-password.ts\",\"scriptArgs\":[\"users\",\"sales-$letter@qa.invalid\"]}" \
    >> "$out/fixture.log" 2>&1
done
pnpm exec payload generate:importmap > "$out/importmap.log" 2>&1
pnpm build > "$out/build.log" 2>&1
cp -R .next/static .next/standalone/.next/
cp -R public .next/standalone/
PORT="$port" HOSTNAME=127.0.0.1 node .next/standalone/server.js > "$out/app.log" 2>&1 &
server_pid=$!
for i in $(seq 1 25); do
  if curl --max-time 2 -fsS -o /dev/null "$PUBLIC_URL/login" 2>/dev/null; then break; fi
  kill -0 "$server_pid"
  sleep 1
done
curl --max-time 2 -fsS -o /dev/null "$PUBLIC_URL/login"
node e2e/need-project-claim.mjs | tee "$out/api-results.jsonl"
