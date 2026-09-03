# 安装（约 10 分钟）

## 前置

- **Obsidian** + 社区插件 **Kanban**（设置 → 第三方插件 → 浏览 → 搜 "Kanban" 安装并启用）
- **Claude Code** CLI（skills 目录 `~/.claude/skills`）
- **Codex** CLI，版本需支持 skills（默认按 `~/.codex/skills`；若你的版本读 `~/.agents/skills`，见第 3 步注释）
- （可选）**Kimi Code** CLI（skills 目录 `~/.kimi-code/skills`）
- （可选，用批注协作才需要）Obsidian 社区插件 **Tandem Comments**——见第 4 步

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

装的是 `/card` `/today` `/done` `/note` `/comments` 五个，claude / codex / kimi 三侧同源（目录不存在的会自动建，没装的 CLI 忽略即可）。

### 3. 接看板协议

把协议片段 append 到两侧的全局指令文件（已有内容不受影响）：

```bash
cat agent-workflow-starter/AGENTS-snippet.md >> ~/.claude/CLAUDE.md
cat agent-workflow-starter/AGENTS-snippet.md >> ~/.codex/AGENTS.md
```

> codex 若用 `~/.agents/skills`：编辑 `bin/sync-skills.sh` 里的 `TARGETS` 数组后重跑第 2 步。

### 4.（可选）开启批注协作

想在 Obsidian 里像批 Word 一样给文档划线批注、让 agent 直接读懂你的意见，装这个：

1. **装插件**：Obsidian 设置 → 第三方插件 → 搜 **Tandem Comments** → 安装并启用。
2. **导出格式 skill**：插件设置 → `Advanced & integrations` → 导出 skill，放进本仓库同级的 skills 目录或直接放 `~/.claude/skills/`。
   （这份是插件作者提供的，讲的是批注在磁盘上的格式；本仓库的 `/comments` 只管"去哪找、怎么回"，两者配合使用。）
3. **Codex 用户额外一步**：Codex 把 skill 和斜杠命令分成两套——`~/.codex/skills/` 里的 skill 只能由模型自己搜索调用，手打 `/comments` 走的是另一套。要斜杠命令就建个转发文件：

```bash
mkdir -p ~/.codex/commands && cat > ~/.codex/commands/comments.md <<'EOF'
---
description: "扫描 Obsidian vault 里点名 @codex 的批注并逐条答复"
disable-model-invocation: true
---

用户输入 `/comments` 时，遵循 `comments` skill（`~/.codex/skills/comments/SKILL.md`），不要在这里重写它的流程。

两件 Codex 专属的事：
- 你是 **Codex**。扫描要跑 `python3 ~/.codex/skills/comments/scan.py --agent codex`（脚本默认查 claude 的队列）。
- 写批注一律署名 `"author": "Codex"`，待办判定依赖它。
EOF
```

用法：在 Obsidian 里选中一段话加批注，写上 `@claude` / `@codex` / `@kimi`（或 `@ai` 谁都行），然后在对应 CLI 里敲 `/comments`。

### 5.（可选）vault 不放默认位置

体系按约定硬编码 `~/workspace/vault`。要换位置的话，全局替换后再做第 2、3 步：

```bash
grep -rl 'workspace/vault' agent-workflow-starter/ | xargs sed -i '' 's#~/workspace/vault#<你的路径>#g'   # macOS
```

（换路径意味着你与仓库更新脱钩，后续 git pull 需自行合并——不折腾就用默认位置。）

### 6. 验证闭环

1. 新开一个 claude 会话，输入 `/today` —— 应读到你的空看板并给出简报；
2. 随口聊出一件待办，说「立卡」—— `/card` 应落一张任务卡进看板，Obsidian 里能看到；
3. 承接后干完说「收工」—— `/done` 应回写执行记录并把卡移到「👀 待我审」。

跑通即安装完成。日常怎么用见 [README.md](README.md)。
