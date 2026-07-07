---
name: note
description: 把当前对话的有价值讨论提炼沉淀为知识笔记，写入 ~/workspace/vault/inbox/，开放问题自动转为看板 Backlog 卡片。触发：/note、"沉淀一下"、"把这次讨论记下来"。
---

# /note — 讨论沉淀

产出：一篇提炼笔记（不是聊天转录）+ 若干新 Backlog 卡。

**10 秒判据（替用户判断，不要让用户想）**：三个月后的用户或另一个 agent，缺了这段结论会不会重新踩坑/重新讨论一遍？会 → 值得沉淀；犹豫 → 不沉淀（个别开放问题可单独转 Backlog 卡，不必成文）。纯执行、无新认知的会话（改个 bug、跑个发布）不需要 /note——那是 /done 的事。

**分工**：agent 主动拟好全文给用户过目，用户只做增删——不要抛开放式问题让用户口述内容。

## 步骤

1. 回顾当前对话，提炼三块：
   - **结论与决策**：定了什么。
   - **理由**：为什么；被否掉的备选方案及否决原因。
   - **开放问题**：还没想清楚的点。
2. 写入 `~/workspace/vault/inbox/YYYY-MM-DD-<主题slug>.md`，frontmatter 含 `date`、`topic`、`agent`（你的名字）。正文对 vault 内相关笔记加 `[[双链]]`。
3. 每个开放问题在 `~/workspace/vault/plans/board.md` 的 `## 💡 Backlog` 末尾追加一张卡：`- [ ] 💭 <问题>（出自 [[<本笔记名>]]）`。
4. 在 vault 内 `git add inbox plans && git commit -m "docs(note): <主题>"`。
5. 向用户回报：笔记路径 + 新增卡片列表。

## 约束

- 笔记 300~800 字，重在推理链，不复述过程，不粘贴原始对话。
- inbox 只是落点，归位由用户每周五 weekly-review 处理；不要移动 inbox 里的旧笔记。
