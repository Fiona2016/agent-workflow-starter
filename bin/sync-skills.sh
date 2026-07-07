#!/usr/bin/env bash
# 幂等：将 starter kit 的 skills/* 软链进 claude 与 codex 的 skills 目录，并报告漂移。
# 软链的好处：本仓库 git pull 后 skill 自动更新，无需重装。
# codex 若读 ~/.agents/skills（见仓库根 install.sh 默认值），把它加进 TARGETS。
set -euo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/../skills" && pwd)"
TARGETS=("$HOME/.claude/skills" "$HOME/.codex/skills")

for t in "${TARGETS[@]}"; do mkdir -p "$t"; done

for skill in "$SRC"/*/; do
  name="$(basename "$skill")"
  for t in "${TARGETS[@]}"; do
    link="$t/$name"
    if [ -L "$link" ]; then
      [ "$(readlink "$link")" = "$SRC/$name" ] || { rm "$link"; ln -s "$SRC/$name" "$link"; echo "fix  $link"; }
    elif [ -e "$link" ]; then
      echo "WARN 实体目录冲突（未覆盖）: $link"
    else
      ln -s "$SRC/$name" "$link"; echo "link $link"
    fi
  done
done
echo "done"
