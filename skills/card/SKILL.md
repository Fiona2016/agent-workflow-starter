---
name: card
description: 随时立卡：把当前对话讨论出的任务提炼成任务卡写入看板（任务卡 + 看板卡 + 提交），可选立即派发或本会话直接承接。触发：/card、"立卡"、"开张卡"、"把这个记到看板"、"这个任务加到 board"。
---

# /card — 随时立卡

产出：`plans/tasks/` 任务卡 + `plans/board.md` 新卡 + vault 提交。与 /today（每日挑选派发）互补：/card 负责收，/today 负责派。看板协议见全局 AGENTS.md。

## 步骤

1. 从当前对话提炼任务要素：
   - 类型：💭 思考（调研/决策，产出文档）或 ⚙️ 执行（改代码，产出分支/PR）；
   - repo（执行卡必填）、背景、目标、验收标准、OKR 编号（如对得上 `areas/okr/` 当月文件）；
   - 要素不全时先问用户补齐——**执行卡没有可检验的验收标准不许落卡**，思考卡可放宽。
2. 建任务卡：按 `plans/tasks/_template.md` 写 `plans/tasks/YYYY-MM-DD-<slug>.md`；
   信息完整可派发 → `status: ready`，还需细化 → `status: backlog`。
3. 看板加卡：在 `plans/board.md` 对应列（`## 📋 Ready` 或 `## 💡 Backlog`）末尾追加一行：
   `- [ ] ⚙️/💭 [[YYYY-MM-DD-<slug>|卡名]]（一句话说明）｜OKR x.y`（无 OKR 则省略尾部）。
4. 提交：vault 内 `git add plans && git commit -m "chore(board): card <卡名>"`。
5. 问用户下一步（三选一）：
   a. **本会话直接承接**——把卡移到 `## 🤖 Agent 进行中`、`status: running`、执行记录登记开工（含**会话指针**，格式见 AGENTS.md 看板协议；本会话即 claude，`session_id = $CLAUDE_CODE_SESSION_ID`），然后继续干（卡路径已在对话中，关联天然成立，收工 /done）；
   b. **派发给新 session**——生成一行派发 prompt（必须含任务卡路径）供用户复制到新的 claude/codex 会话；
   c. **留着**——留在 Ready/Backlog，等 /today 统一挑选。

## 约束

- 一次一卡；对话里有多个任务就逐个走 1~4。
- 只追加，不动已有卡片、不改列名、不重排。
- 与 /note 的分工：知识、结论、开放问题走 /note；目标明确的待办任务走 /card。
