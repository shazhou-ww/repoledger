# Progress

Updated: 2026-09-23

## Current state

已形成一份重新编排的 Repoledger vNext 架构提案，使用 ULID idea identity、idea folder 的
Git tree OID、per-idea sibling status 和纯状态推导，替代此前围绕中央 task ledger、强制
source branch 与持久 phase state 展开的设计。

下一步是评审 [新设计提案](../../docs/new-design.md) 的范围、接口、数据模型和架构取舍；
在这些 gate 获得明确决定前，不开始生产实现或迁移。

## Decisions

- Idea folder 只保存理想定义；status 与 folder 并列，避免 status 更新改变 idea revision。
- Idea revision 使用 Git subtree object ID，不使用自定义 digest 或整个 primary commit ID。
- State 不持久化，按 `abandoned` 与三个 revision acceptance 的有序规则纯推导为
  `preparing | implementing | deploying | completed | abandoned`。
- Impl/deploy criteria 的存在性和逐项状态不参与推导；每个 idea 固定经过三个确认阶段。
- Idea 内容变化使旧 acceptance 自然失效，不级联清理旧 revision；清除 abandonment 也不
  清理 acceptance。
- 默认使用 local primary branch 工作；feature branch 和 commit trailer 都是可选协作手段，
  因而首版主动放弃强制的 per-idea commit attribution 和历史 phase enforcement。
- `whatsnext` 是面向人和 Agent 的核心产品入口，`check` 作为 hook/CI plumbing 保留。

## Human approvals

| Checkpoint | Status | Review artifact and decision evidence |
| --- | --- | --- |
| Scope | Pending | 评审 [新设计提案](../../docs/new-design.md) 的目标、范围、非目标与 breaking redesign 边界。 |
| Interface | Pending | 评审 `repoledger whatsnext [idea]`、`repoledger check`、ULID/alias 选择与 worktree hygiene 输出。 |
| Business and data model | Pending | 评审 idea/status layout、Git tree revision、最小 status 字段和纯状态推导函数。 |
| Architecture | Pending | 评审 primary authority、单 main/可选 branch 取舍、Git/CI enforcement 与迁移策略。 |
| Delivery acceptance | Pending | 等待实现、自动化验证和代表性端到端演示。 |

## Validation

- 现有 v2 `repoledger status agent-whatsnext-loop --json`：确认承载本次设计工作的 legacy
  task 为 `ongoing`，语言为 `zh-CN`。
- 现有 v2 `repoledger check agent-whatsnext-loop --remote --json`：确认设计更新前 legacy
  primary 与 advertised source 一致；这不是对 vNext storage schema 的实现验证。

## Blockers

- None.

## Outcome

新架构提案已形成，尚待四项前置 human review；task lifecycle 仍为 `ongoing`。