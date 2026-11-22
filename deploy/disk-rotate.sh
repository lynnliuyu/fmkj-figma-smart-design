#!/usr/bin/env bash
# 旧发布目录与暂存目录轮转。
#
# 只保留最近 N 个 release 目录（默认 2：当前 + 上一版回滚点），其余按时间删除；
# src-* 暂存目录同样保留最近 N 个，并额外保护被引用的目录。
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
#   - src-current 及其指向的目录
#   - /opt/fmkj/backups（备份有自己的保留策略）
#   - 数据库卷与素材卷
set -euo pipefail

RELEASES=${RELEASES:-/opt/fmkj/releases}
APP_ROOT=$(dirname "$RELEASES")
KEEP_RELEASES=${KEEP_RELEASES:-2}
DRY_RUN=${DRY_RUN:-0}

log() { printf '  %s\n' "$*"; }
remove_dir() {
  if [[ "$DRY_RUN" == "1" ]]; then
    log "[dry-run] rm -rf -- $1"
  else
    sudo -n rm -rf -- "$1"
  fi
}

[[ -d "$RELEASES" ]] || { echo "  （$RELEASES 不存在，跳过）"; exit 0; }

# 无法核对容器引用时停止轮转，避免删掉线上或回滚目录。
containers=$(sudo -n docker ps -aq)
PROTECTED=$(cd "$APP_ROOT/src-current" 2>/dev/null && pwd -P || true)
for container in $containers; do
  refs=$(sudo -n docker inspect "$container" --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}{{range .Mounts}}{{println}}{{.Source}}{{end}}')
  PROTECTED+=$'\n'"$refs"
done
is_protected() {
  local dir="$1"
  local path
  while IFS= read -r path; do
    [[ "$path" == "$dir" || "$path" == "$dir/"* ]] && return 0
  done <<< "$PROTECTED"
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
  [[ -d "$dir" && ! -L "$dir" ]] || continue
  # 在用的目录（当前服务 + 上一版回滚点）已经占掉配额，不能再额外多留：
  # 之前这里 continue 得太早、没计入 kept，实测会留下 4 个而不是 2 个。
  kept=$((kept+1))
  if is_protected "$dir" || is_protected "$dir/src"; then
    log "保留（在用，占第 ${kept} 个名额） $(basename "$dir")"
    continue
  fi
  if (( kept <= KEEP_RELEASES )); then
    log "保留（最新 ${kept}） $(basename "$dir")"
    continue
  fi
  size=$(sudo -n du -sh "$dir" 2>/dev/null | cut -f1 || true)
  log "删除 ${size:-?}  $(basename "$dir")"
  remove_dir "$dir"
done <<< "$REL_LIST"

# ── src-* 手工发布暂存目录 ──────────────────────────────
SRC_LIST=$(ls -1dt "$APP_ROOT"/src-*/ 2>/dev/null | sed 's:/*$::' || true)
kept=0
while IFS= read -r dir; do
  [[ -d "$dir" && ! -L "$dir" && "$dir" != "$APP_ROOT/src-current" ]] || continue
  kept=$((kept+1))
  if is_protected "$dir" || (( kept <= KEEP_RELEASES )); then
    log "保留 $(basename "$dir")"
    continue
  fi
  size=$(sudo -n du -sh "$dir" 2>/dev/null | cut -f1 || true)
  log "删除 ${size:-?}  $(basename "$dir")（无容器引用）"
  remove_dir "$dir"
done <<< "$SRC_LIST"

after=$(df -Pk "$RELEASES" | awk 'NR==2{print $4}' || echo 0)
log "释放 $(( (after-before)/1024 )) MB，现可用 $((after/1024/1024)) GB"
