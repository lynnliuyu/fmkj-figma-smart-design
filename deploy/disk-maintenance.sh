#!/usr/bin/env bash
# 服务器磁盘维护：清 /tmp 旧残留 + 收系统日志上限。
#
# 为什么需要它：2026-11-22 实测 /tmp 攒了 4.28 GB 历史构建/测试残留
# （bundle、tar 包、旧 smoke 目录，最久的 15 天），是当时最大的一次性浪费。
# 发布流程只关心 releases/ 与镜像，没人管 /tmp，于是它无限增长。
#
# 用法（服务器上）：
#   bash deploy/disk-maintenance.sh            # 清 3 天前的 /tmp 残留 + journal 收到 200M
#   DRY_RUN=1 bash deploy/disk-maintenance.sh  # 只打印
#   TMP_KEEP_DAYS=7 bash deploy/disk-maintenance.sh
#
# cron（/etc/cron.d/fmkj-disk，每周日 04:30）：
#   30 4 * * 0 root /opt/fmkj/bin/fmkj-disk-maintenance.sh >> /var/log/fmkj-disk.log 2>&1
set -euo pipefail

TMP_KEEP_DAYS=${TMP_KEEP_DAYS:-3}
JOURNAL_MAX=${JOURNAL_MAX:-200M}
DRY_RUN=${DRY_RUN:-0}
RELEASES=${RELEASES:-/opt/fmkj/releases}

log() { printf '[%s] %s\n' "$(date '+%F %T')" "$*"; }
run() {
  if [[ "$DRY_RUN" == "1" ]]; then
    log "[dry-run] $*"
  else
    sudo -- "$@"
  fi
}

before=$(df -Pk / | awk 'NR==2{print $4}')
log "开始：可用 $((before/1024/1024)) GB"

# ── /tmp：只清构建/测试残留 ──────────────────────────────
# 必须跳过的东西：
#   eevee-release-*       发布流程正在用的解压目录与凭据
#   systemd-private-*     系统服务私有目录
#   .font-unix / .ICE-unix / .X11-unix / .XIM-unix / snap-private-tmp
#   tmux-* / .s.PGSQL.*   活动 socket
freed_mb=0
for path in /tmp/*; do
  [[ ! -L "$path" && ( -f "$path" || -d "$path" ) ]] || continue
  base=$(basename "$path")
  case "$base" in
    eevee-release-*|systemd-private-*|snap-private-tmp|tmux-*|.font-unix|.ICE-unix|.X11-unix|.XIM-unix|.s.PGSQL.*) continue ;;
  esac
  days=$(( ( $(date +%s) - $(stat -c %Y "$path") ) / 86400 ))
  (( days < TMP_KEEP_DAYS )) && continue
  mb=$(sudo du -sm "$path" 2>/dev/null | cut -f1 || echo 0)
  log "删除 ${mb} MB（${days} 天） $path"
  run rm -rf -- "$path"
  freed_mb=$((freed_mb+mb))
done
log "/tmp 清理：${freed_mb} MB"

# ── 构建缓存：留有上限，不独占磁盘 ────────────────────────
run docker builder prune -f --keep-storage 2GB || log "构建缓存清理失败"

# ── 旧发布目录：走同一套轮转逻辑 ──────────────────────────
# 本脚本装到 /opt/fmkj/bin/ 后，同目录还要有 disk-rotate.sh（安装步骤会一起装）。
# 找不到就明确说出来 —— 之前是静默跳过，等于这条维护从来没生效过。
HERE=$(cd "$(dirname "$0")" && pwd)
if [[ -f "$HERE/disk-rotate.sh" ]]; then
  DRY_RUN="$DRY_RUN" bash "$HERE/disk-rotate.sh" || log "轮转失败（不影响本次其它清理）"
else
  log "⚠️  未找到 $HERE/disk-rotate.sh，跳过发布目录轮转（安装步骤缺了一步）"
fi

# ── 系统日志 ──────────────────────────────────────────
run journalctl --vacuum-size="$JOURNAL_MAX" || log "归档日志清理失败"

after=$(df -Pk / | awk 'NR==2{print $4}')
log "完成：可用 $((after/1024/1024)) GB（本次释放 $(( (after-before)/1024 )) MB）"
