# Agent 工作流 starter kit

用一块 Obsidian 看板管理你和 claude / codex 的协作：任务从哪来、派给谁、干到哪了、当时的对话在哪——都能在看板上找到答案。

## 解决什么问题

日常和 agent 协作久了会遇到三件烦心事：

1. **任务散**：想法散落在聊天记录里，做没做过、做到哪了没有单一事实源；
2. **会话飞**：多个 claude/codex 会话同时跑，回头想不起哪个会话在干哪件事;
3. **过程丢**：两周后想回看"当时为什么这么定"，对话找不回来了。

这套体系用三个机制对应解决：**看板做单一事实源**（Obsidian Kanban，五列：Backlog → Ready → Agent 进行中 → 待我审 → Done）、**一卡一工作会话**（每张执行卡对应一个专属 agent 会话，派发 prompt 带卡路径完成关联）、**会话指针**（开工时把 session_id + resume 命令登记进卡，随时 `claude --resume` / `codex resume` 回看当时对话）。

## 日常闭环：四个 skill

| skill | 时机 | 干什么 |
|---|---|---|
| `/card` | 随时 | 把对话里讨论出的任务落成任务卡进看板（收） |
| `/today` | 每天早上 | 读看板+报告+OKR，5 分钟对话定今日 2~3 件事并派发（派） |
| `/done` | 每个工作会话结束前 | 把结果回写任务卡、移卡到「待我审」（记账） |
| `/note` | 有值得留的讨论时 | 把决策+理由+被否方案提炼进 `inbox/`（记知，较少用） |

典型的一天：早上 `/today` 挑 2~3 件事 → 执行卡各派一个新会话（prompt 里带卡路径）→ 各会话干完 `/done` 回写 → 你在「👀 待我审」统一验收 → 有价值的讨论顺手 `/note`。中途冒出的新任务随时 `/card` 收进 Backlog，不打断当前事。

## 几条设计原则（为什么这么定）

- **一卡一工作会话**：卡是任务的账本，会话是干活的现场；一对一才能让回写和回溯不糊。会话内部开子 agent 并行干活是实现细节，不违反此规则。
- **join key 是卡路径，不是 session ID**：派发时 session 还不存在，卡路径是唯一两边都有的东西；session ID 反向登记进卡（会话指针）。
- **一类东西一个家**：任务的账在任务卡、认知在 `inbox/`、报告在 `reports/`、产出在 `work/`——判据表见 [vault-template/README.md](vault-template/README.md)。
- **未完成也要回写**：卡不许静默留在「进行中」，卡点本身就是有价值的记录。

## 内容物

```
agent-workflow-starter/
├── SETUP.md            # 10 分钟装机指南 ← 从这里开始
├── AGENTS-snippet.md   # 看板协议（append 到 claude/codex 全局指令）
├── skills/             # card / today / done / note
├── bin/sync-skills.sh  # 软链安装，git pull 自动更新
└── vault-template/     # vault 骨架：五列看板 + 任务卡模板 + README
```

安装见 [SETUP.md](SETUP.md)。
