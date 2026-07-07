# 安装（约 10 分钟）

## 前置

- **Obsidian** + 社区插件 **Kanban**（设置 → 第三方插件 → 浏览 → 搜 "Kanban" 安装并启用）
- **Claude Code** CLI（skills 目录 `~/.claude/skills`）
- **Codex** CLI，版本需支持 skills（默认按 `~/.codex/skills`；若你的版本读 `~/.agents/skills`，见第 3 步注释）

## 步骤

### 1. 建 vault（默认位置 `~/workspace/vault`）

```bash
cp -R agent-workflow-starter/vault-template ~/workspace/vault
cd ~/workspace/vault && git init && git add -A && git commit -m "init vault"
```

用 Obsidian「打开文件夹作为仓库」打开 `~/workspace/vault`，启用 Kanban 插件，打开 `plans/board.md` 应看到五列看板。

### 2. 装 skills（软链，git pull 自动更新）

```bash
./agent-workflow-starter/bin/sync-skills.sh
```

装的是 `/card` `/today` `/done` `/note` 四个，claude / codex 两侧同源。

### 3. 接看板协议

把协议片段 append 到两侧的全局指令文件（已有内容不受影响）：

```bash
cat agent-workflow-starter/AGENTS-snippet.md >> ~/.claude/CLAUDE.md
cat agent-workflow-starter/AGENTS-snippet.md >> ~/.codex/AGENTS.md
```

> codex 若用 `~/.agents/skills`：编辑 `bin/sync-skills.sh` 里的 `TARGETS` 数组后重跑第 2 步。

### 4.（可选）vault 不放默认位置

体系按约定硬编码 `~/workspace/vault`。要换位置的话，全局替换后再做第 2、3 步：

```bash
grep -rl 'workspace/vault' agent-workflow-starter/ | xargs sed -i '' 's#~/workspace/vault#<你的路径>#g'   # macOS
```

（换路径意味着你与仓库更新脱钩，后续 git pull 需自行合并——不折腾就用默认位置。）

### 5. 验证闭环

1. 新开一个 claude 会话，输入 `/today` —— 应读到你的空看板并给出简报；
2. 随口聊出一件待办，说「立卡」—— `/card` 应落一张任务卡进看板，Obsidian 里能看到；
3. 承接后干完说「收工」—— `/done` 应回写执行记录并把卡移到「👀 待我审」。

跑通即安装完成。日常怎么用见 [README.md](README.md)。
