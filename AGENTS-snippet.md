## 个人工作流：看板协议（所有 agent 必须遵守）

用户的任务体系位于 Obsidian vault `~/workspace/vault/`：

- 看板：`plans/board.md`，Obsidian Kanban 格式（`## 列名` 为列、`- [ ]` 为卡片）。
  列：`## 💡 Backlog` / `## 📋 Ready` / `## 🤖 Agent 进行中` / `## 👀 待我审` / `## ✅ Done（本周）`
- 任务卡：`plans/tasks/YYYY-MM-DD-<slug>.md`（模板 `plans/tasks/_template.md`），含 repo、背景、目标、验收标准、执行记录。

当你承接一个执行任务（任务卡派发）时：

1. 开始：把对应卡片移到 `## 🤖 Agent 进行中` 下，任务卡 frontmatter `status: running`。
2. 完成：卡片移到 `## 👀 待我审`，`status: review`，并在任务卡「执行记录」追加结果摘要与分支/PR 链接。
3. 需要用户决策：同样移到 `## 👀 待我审`，在「执行记录」写清问题与候选选项，然后停止等待。
4. 移卡只做纯文本整行移动；不改列名、不动其他卡片、不重排顺序。

**会话与卡片的关联**：join key 是任务卡文件路径（不是 session ID）。
- 派发方：给承接 agent 的 prompt 必须包含任务卡路径。
- 承接方开工：在卡「执行记录」登记开始时间、承接 agent、工作分支，并补一条**会话指针**（格式见下），以便日后从卡回看当时对话。
- 承接方收工：执行 done skill 回写（含未完成也要写）——追加执行记录、更新 status、移卡、提交，不要静默结束会话；开工漏记会话指针的，收工补上。

**会话指针**：写进「执行记录」，日后据此 resume 回看当时对话。
- 格式：`- 会话：<渠道> · <session_id> · resume：<命令>`
- claude：`session_id = $CLAUDE_CODE_SESSION_ID`（`echo` 即得），命令 `claude --resume <id>`。
- codex：codex 不导出该变量——反查 `~/.codex/sessions/YYYY/MM/DD/` 下 cwd 匹配当前目录的最新 `rollout-*-<uuid>.jsonl`，文件名末尾 UUID 即 session_id，命令 `codex resume <id>`；取不到就回退：在该 repo 目录运行 `codex resume --last`（picker 已按 cwd 过滤）。

知识沉淀写 `inbox/`（见 note skill），调研产出写 `work/`，报告输出统一 `~/workspace/vault/reports/`。
