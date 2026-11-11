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
# TLA+ 模块名必须与文件名一致，否则 SANY 直接 abort。本机没有 mise，
# 所以显式指定已校验 sha256 的 tla2tools.jar 和 Temurin JRE。
export TLA2TOOLS="${TLA2TOOLS:-$HOME/.config/alma/tools/tla/tla2tools.jar}"
export JAVA="${JAVA:-/tmp/fv-scratch/jre/jdk-21.0.13+9-jre/Contents/Home/bin/java}"
if [ ! -f "$TLA2TOOLS" ]; then
  echo "❌ 找不到 tla2tools.jar：$TLA2TOOLS"
  echo "   下载 v1.7.4 release（sha256 936a2620…）放到该路径。"
  exit 1
fi
OUT="${1:-/tmp/verify-pm-$(date +%s)}"
echo "▸ 现状版（预期：DuringSaveEditSurvives 违反）"
"$SKILL" Buggy.tla --out "${OUT}/buggy" || true
echo
echo "▸ 修复版（预期：规则成立）"
"$SKILL" FixedCase.tla --out "${OUT}/fixed" || true
echo
echo "结果目录：$OUT"
