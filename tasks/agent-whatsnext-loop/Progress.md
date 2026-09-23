# Progress

Updated: 2026-09-23

## Current state

Scope review 已批准 Repoledger vNext breaking redesign，并确认继续在当前 repository 实现。
Canonical Task 已改写为 idea-ledger outcome contract；旧 phase-loop Design 已标记 superseded。

当前提案已收敛四项选择：status 使用普通 Git 编辑而不增加 mutation commands；vNext 直接
cutover 而不保留 v2 runtime 双模式；`Idea.md` 仅要求存在；single-primary 是协议模型。
下一步是对更新后的 Interface、Business and data model 与 Architecture artifact 作最终确认；
在这些 gate 获批前不开始生产实现。

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
- Scope review 批准以 vNext idea model 取代原 task/phase/source-branch 方案，并留在本 repo。
- `whatsnext` 只读；status 由普通文件编辑、`check`、commit 与 non-force push 更新。
- vNext 不提供 v2 runtime 双模式或首版 in-place migration command；旧 repository 在转换前
  继续使用 v2 release。
- `Idea.md` 仅要求存在，不校验固定核心章节。
- Single-primary 是协议模型；feature branch 不进入 status 或 state derivation。

## Human approvals

| Checkpoint | Status | Review artifact and decision evidence |
| --- | --- | --- |
| Scope | Approved | 用户于 2026-09-23 审阅并明确批准 [新设计提案](../../docs/new-design.md) 的 vNext idea-ledger breaking redesign 取代原 task 方案，并决定在当前 repo 实现。 |
| Interface | Pending | 最终评审 `repoledger whatsnext [idea]`、`repoledger check`、ULID/alias 选择、只读输出、普通 Git status mutation 与 worktree hygiene。 |
| Business and data model | Pending | 最终评审 idea/status layout、Git tree revision、最小 status 字段、自由格式 `Idea.md` 与纯状态推导函数。 |
| Architecture | Pending | 最终评审 primary authority、single-primary/可选 branch、Git/CI enforcement、直接 cutover 与 migration-required 边界。 |
| Delivery acceptance | Pending | 等待实现、自动化验证和代表性端到端演示。 |

## Validation

- 现有 v2 `repoledger status agent-whatsnext-loop --json`：确认承载本次设计工作的 legacy
  task 为 `ongoing`，语言为 `zh-CN`。
- 现有 v2 `repoledger check agent-whatsnext-loop --remote --json`：确认设计更新前 legacy
  primary 与 advertised source 一致；这不是对 vNext storage schema 的实现验证。
- `repoledger check agent-whatsnext-loop`：更新 canonical Task、Progress 与设计链接后通过；仅
  报告尚未批准的 Interface、Business and data model、Architecture 与 Delivery checkpoints。
- `node --test test/check.test.js test/content.test.js test/cli.test.js`：39 项通过。
- `pnpm check:skills` 与 `git diff --check`：通过。
- `pnpm check`：109 项通过、1 项因当前 Windows checkout 把 Git mode `120000` 的
  `.github/skills/repoledger` 物化为普通文件而在 `readlink` 处失败、1 项 symlink 权限测试跳过；
  index mode 与 committed target `../../skills/repoledger` 均已核对正确，该失败与本次文档变更
  无关，仍需在支持 symlink 的 CI/checkout 中完成全量确认。

## Blockers

- None.

## Outcome

新架构提案已形成，尚待四项前置 human review；task lifecycle 仍为 `ongoing`。