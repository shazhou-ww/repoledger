# Progress

Updated: 2026-09-21

## Current state

实现和自动化验证已完成。下一步是将实现与本进度记录一同发布到任务 source ref，
集成到 primary 后由用户审阅最终提交并决定 Delivery acceptance。

## Decisions

- 将本地内容校验抽成统一 snapshot 检查，remote、commit、staged 和 unstaged 目标只负责构造隔离快照及对应 path set。
- remote 与 commit 只检查目标 commit 相对第一父提交的变化；root commit 使用完整 root tree，不再枚举既有提交。
- staged 目标从 index tree 构造临时 worktree；unstaged 目标从 index 基线和 tracked worktree changes 构造临时 Git commit，明确忽略 untracked files。
- 只有 remote 目标 fetch primary 并验证 ongoing source refs；其他显式目标不联网，也不修改调用者 branch、index、worktree 或 stash ref。
- 保留 `progress.history.bookkeeping-only` 诊断 code 以维持结构化报告兼容性，同时将 remediation 改为面向所选目标。

## Human approvals

| Checkpoint | Status | Review artifact and decision evidence |
| --- | --- | --- |
| Scope | Approved | 用户于 2026-09-21 审阅并批准 Task.md 中的目标、范围、非目标、约束和验收标准，允许进入实现。 |
| Interface | Approved | 用户于 2026-09-21 审阅并批准 Task.md 中四种互斥目标参数、联网边界和默认本地行为。 |
| Business and data model | Not applicable | 不改变 lifecycle record、schema 或持久化业务数据。 |
| Architecture | Not applicable | 沿用现有 check、Git helper 和临时 worktree 边界。 |
| Delivery acceptance | Pending | 等待用户审阅已发布实现、自动化验证结果和代表性 CLI 输出。 |

## Validation

- `node --test test/git.test.js`：5 项通过，覆盖 commit path、index/unstaged snapshot、Git identity 独立性和 caller 状态隔离。
- `node --test test/check.test.js`：11 项通过，覆盖 commit、root、merge first-parent、staged/unstaged 隔离及 untracked 排除。
- `node --test test/cli.test.js test/skill.test.mjs`：20 项通过，覆盖 CLI 参数互斥、帮助和 skill 文档。
- remote 定向 publication 测试：3 项通过，覆盖当前违规、旧违规恢复和缺失 source branch。
- `repoledger check --commit HEAD --json` 与 `repoledger check --unstaged --json`：实际 CLI smoke 均通过并报告正确 target source。
- `pnpm check`：105 项测试通过；package 内容、安装 smoke test 和 skill 发现检查通过。

## Blockers

- None.

## Outcome

实现完成并满足任务验收标准；尚待 source publication、primary 集成和用户对精确最终提交的 Delivery acceptance。