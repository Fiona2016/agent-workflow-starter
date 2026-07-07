# vault

个人工作流 vault（Obsidian）。规则：一类东西只有一个家。

- `inbox/` 快速捕获（/note 落点），每周五清空归位
- `plans/` 任务层：`board.md` 看板 + `tasks/` 任务卡
- `work/` 项目类：进行中工作的调研、方案、产出
- `areas/` 长期维护类：okr、weekly-review、learning…（按需建）
- `reports/` 报告输出：日报/周报/调研报告统一落这里
- `attachments/` 贴图与二进制附件
- `archive/` 完结内容（用到才建）

## 工作流使用的 skills

日常闭环（claude / codex 通用，源在 fc-awsome-skills 的 `agent-workflow-starter/skills/`）：

- `/card` — 随时立卡：把对话讨论出的任务落成任务卡进看板（Ready/Backlog），可当场承接或派发
- `/today` — 每日开工：读看板 + 昨日报告 + OKR，对话定今日 2~3 件事，派发执行项并移卡
- `/done` — 收工回写：会话结束前把结果回写任务卡（执行记录 + 移卡到待我审 + 提交），与 /today 对称
- `/note` — 讨论沉淀：把有价值的对话提炼进 `inbox/`，开放问题自动转 Backlog 卡

会话与卡片的关联：join key 是任务卡路径——派发 prompt 必须带卡路径，承接方开工登记（含**会话指针**：渠道 + session_id + resume 命令，日后可据此回看当时对话）、收工 `/done` 回写（详见全局 AGENTS 指令里的看板协议）。

分不清时看这里（按"东西是什么"归家，不按"哪天产生"）：

| 东西 | 家 | 谁写 | 一句话判据 |
|---|---|---|---|
| 这件事干到哪了 | 任务卡「执行记录」 | `/done` | 任务的账，每张承接的卡都要记 |
| 讨论出的认知（决策+理由+被否方案） | `inbox/` | `/note` | 三个月后缺了它会重新踩坑才写；纯执行会话不写 |
| 干了什么的客观流水 | `reports/` | 机器/报告 skill | 从 git/GitHub 生成，人不编辑 |
| 调研/方案等工作产出 | `work/` | 思考型任务 | 有明确读者的文档，不是随手笔记 |

人/agent 主笔的报告（调研、复盘、汇报等）：正文结构按场景自由发挥，但统一带薄外壳 frontmatter（`date` / `topic` / `type: 调研|复盘|汇报|方案` / `audience` / `status: draft|final`），命名 `<类型>-<日期>.md`。**抽模板判据**：同一类型写到第二篇、发现在照抄第一篇结构时，才从真实样本抽模板（放 `reports/_template-<类型>.md`）；不预设。
