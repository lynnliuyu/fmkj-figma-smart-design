#!/usr/bin/env bash
# 旧发布目录与暂存目录轮转。
#
# 只保留最近 N 个 release 目录（默认 2：当前 + 上一版回滚点），其余按时间删除；
# 同时清理手工发布时代遗留的 src-* 暂存目录（从未被容器引用过）。
#
# 为什么需要它：2026-11-22 实测 /opt/fmkj/releases 攒了 12 个目录、
# 另有一批 src-<hash>/src-<日期> 暂存目录共约 2.5 GB，全部是历次发布遗留，
# 没有任何清理机制，直到磁盘只剩 1.1 GB 才被发现。
#
# 用法：
#   bash deploy/disk-rotate.sh                 # 默认保留 2 个 release
#   KEEP_RELEASES=3 bash deploy/disk-rotate.sh # 保留 3 个
#   DRY_RUN=1 bash deploy/disk-rotate.sh       # 只打印将删什么
#
# 安全边界（绝不动）：
#   - 被任何容器（含已停止）作为 working_dir 引用的目录
#   - 当前正在服务的 release（脚本自动从 Caddy 反查端口 → 容器 → working_dir）
#   - /opt/fmkj/backups（备份有自己的保留策略）
#   - 数据库卷与素材卷
set -euo pipefail

RELEASES=${RELEASES:-/opt/fmkj/releases}
APP_ROOT=$(dirname "$RELEASES")
KEEP_RELEASES=${KEEP_RELEASES:-2}
CADDY=${CADDY:-/opt/fanmeng-gateway/releases/aad2e52/deploy/remote/caddy/gateway.Caddyfile}
DRY_RUN=${DRY_RUN:-0}

log() { printf '  %s\n' "$*"; }
run() { if [[ "$DRY_RUN" == "1" ]]; then log "[dry-run] $*"; else eval "sudo $*"; fi }

# 所有容器（含已退出）引用过的 working_dir —— 命中即跳过。
referenced_dirs() {
  command -v docker >/dev/null 2>&1 || return 0
  sudo -n docker ps -a --format '{{.Names}}' 2>/dev/null \
    | while read -r c; do
        sudo -n docker inspect "$c" \
          --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' 2>/dev/null
      done | grep -F "$APP_ROOT" || true
}

# 当前正在服务的 release 目录：Caddy 端口 → 容器 → working_dir。
live_dir() {
  command -v docker >/dev/null 2>&1 || return 0
  [[ -r "$CADDY" ]] || return 0
  local port container
  port=$(sudo -n awk '/reverse_proxy 127\.0\.0\.1:130[0-9][0-9]/ {print substr($2,length($2)-4);exit}' "$CADDY" 2>/dev/null || true)
  [[ -z "$port" ]] && return 0
  container=$(sudo -n docker ps --format '{{.Names}} {{.Ports}}' \
    | awk -v p="127.0.0.1:$port->" 'index($0,p){print $1; exit}')
  [[ -z "$container" ]] && return 0
  sudo -n docker inspect "$container" \
    --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' 2>/dev/null || true
}

[[ -d "$RELEASES" ]] || { echo "  （$RELEASES 不存在，跳过）"; exit 0; }

PROTECTED=$'\n'"$(referenced_dirs)"$'\n'"$(live_dir)"$'\n'
is_protected() {
  local dir="$1"
  [[ "$PROTECTED" == *$'\n'"$dir"* ]] && return 0
  [[ "$PROTECTED" == *"$dir"* ]] && return 0
  return 1
}

before=$(df -Pk "$RELEASES" | awk 'NR==2{print $4}' || echo 0)
log "磁盘可用 $((before/1024/1024)) GB，保留最近 ${KEEP_RELEASES} 个 release"

# ── releases/<时间戳> ──────────────────────────────────
# Newest-first, via `ls -1dt` so this also works on the macOS bash 3.2 used for
# local dry-runs (`find -printf` is GNU-only).
REL_LIST=$(ls -1dt "$RELEASES"/20*/ 2>/dev/null | sed 's:/*$::' || true)
kept=0
while IFS= read -r dir; do
  [[ -n "$dir" ]] || continue
  if is_protected "$dir" || is_protected "$dir/src"; then
    log "保留（在用） $(basename "$dir")"
    continue
  fi
  kept=$((kept+1))
  if (( kept <= KEEP_RELEASES )); then
    log "保留（最新 ${kept}） $(basename "$dir")"
    continue
  fi
  size=$(sudo -n du -sh "$dir" 2>/dev/null | cut -f1 || true)
  log "删除 ${size:-?}  $(basename "$dir")"
  run rm -rf "$dir"
done <<< "$REL_LIST"

# ── src-* 手工发布暂存目录（只删无人引用的）─────────────────
shopt -s nullglob
for dir in "$APP_ROOT"/src-*; do
  [[ -d "$dir" ]] || continue
  if is_protected "$dir"; then
    log "保留（在用） $(basename "$dir")"
    continue
  fi
  # src-current 是指向当前源码的快捷方式，保留。
  [[ "$(basename "$dir")" == 'src-current' ]] && { log "保留 src-current"; continue; }
  size=$(sudo -n du -sh "$dir" 2>/dev/null | cut -f1 || true)
  log "删除 ${size:-?}  $(basename "$dir")（无容器引用）"
  run rm -rf "$dir"
done
shopt -u nullglob

after=$(df -Pk "$RELEASES" | awk 'NR==2{print $4}' || echo 0)
log "释放 $(( (after-before)/1024 )) MB，现可用 $((after/1024/1024)) GB"
