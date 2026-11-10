#!/usr/bin/env bash
# 重跑点位图「保存/草稿」并发验证。
# 工具不在仓库里：需要 TLA2TOOLS（tla2tools.jar）与 JAVA（JDK/JRE 11+）。
set -euo pipefail
cd "$(dirname "$0")"
SKILL="${STATEHART:-$HOME/.config/alma/skills/statechart/scripts/statechart}"
if [ ! -x "$SKILL" ]; then
  echo "❌ 找不到 statechart 运行器：$SKILL"
  echo "   从 cursor/plugins 的 pstack/skills/statechart 取。"
  exit 1
fi
OUT="${1:-/tmp/verify-pm-$(date +%s)}"
echo "▸ 现状版（预期：DuringSaveEditSurvives 违反）"
"$SKILL" Save.tla --out "${OUT}/buggy" || true
echo
echo "▸ 修复版（预期：规则成立）"
"$SKILL" SaveFixed.tla --out "${OUT}/fixed" || true
echo
echo "结果目录：$OUT"
