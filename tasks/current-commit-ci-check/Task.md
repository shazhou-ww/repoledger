# 为检查命令增加有界的 Git 目标

Created: 2026-09-21
Language: zh-CN

## Goal

`repoledger check` 能够明确选择远端主分支 tip、指定 commit、staged changes 或
unstaged changes 作为检查目标；所有提交级 `Progress.md` 策略检查都只检查所选
目标，不再遍历既有 commit history。

## Context

当前 `check --remote` 除了校验远端主分支快照和 ongoing task 的 source ref，还会
从 `status.yaml` 引入后遍历主分支的一方历史，逐个 commit 检查是否存在仅修改
`Progress.md` 的记账提交。这使检查成本随仓库历史持续增长，而且历史违规即使已用
正向提交修复，后续检查仍会永久失败。CI 只需要判定当前发布 commit 和当前共享
状态是否合规；开发者还需要在发布前针对指定 revision、index 或工作树变化运行同一
套校验，而不必临时提交、切换 branch 或改写工作树。

## Scope

- 将提交级 `Progress.md` 策略检查限制为远端主分支当前 tip commit 相对其第一父提交的变化。
- 增加 `--commit <revision>`，校验指定 commit 的仓库快照及其相对第一父提交的变化。
- 增加 `--staged`，校验 index 所表示的候选快照及其相对 `HEAD` 的 staged changes。
- 增加 `--unstaged`，校验当前工作树及其相对 index 的 unstaged changes，并明确未跟踪文件的处理规则。
- 将 `--remote`、`--commit`、`--staged` 和 `--unstaged` 定义为互斥的目标选择；未选择目标时保留现有本地工作树快照校验。
- 保留当前远端主分支 tip 的配置、ledger、任务工件和本地链接等快照校验。
- 保留 selected ongoing task 的 source branch 可用性和 start ancestry 校验。
- 为普通提交、merge commit、初始 commit 及历史中已有违规但当前 tip 合规的情况定义确定性行为。
- 更新 CLI 帮助、用户文档和自动化测试，使每种目标的基线、快照和联网行为明确且可验证。

## Out of scope

- 审计或修复远端主分支的完整历史。
- 改写、删除或豁免既有 commit。
- 同时组合多个目标、比较任意两个 revision，或提供通用 Git diff 前端。
- 改变任务生命周期、source ref 发布或完成规则。

## Acceptance criteria

- [x] `repoledger check --remote` 不再枚举远端主分支的 commit history，检查成本不随历史 commit 数量线性增长。
- [x] 当前 tip commit 修改任一 task 的 `Progress.md` 且未修改 `tasksDirectory` 外的 tracked path 时，远端检查失败并返回明确诊断。
- [x] 当前 tip commit 的 `Progress.md` 变化同时伴随 `tasksDirectory` 外的 tracked path 变化时，提交级检查通过。
- [x] 既有历史包含 progress-only commit、但当前 tip 合规时，远端检查不会因旧提交失败。
- [x] `--commit <revision>` 校验该 revision 的完整快照和单个 commit diff；无效或不可解析的 revision 返回明确诊断。
- [x] `--staged` 只用 index 中的候选快照和相对 `HEAD` 的 staged changes 作出判断，不混入 unstaged 或 untracked changes。
- [x] `--unstaged` 只用工作树相对 index 的变化作出提交级判断，并以文档化、经过测试的方式处理 untracked files。
- [x] 同时提供多个目标参数时命令以 usage error 退出，不执行含糊的合并检查。
- [x] 不带目标参数的 `check` 保持现有本地工作树快照校验兼容性。
- [x] merge commit 和无父提交的 tip 行为有明确测试，不会回退为全历史扫描。
- [x] 远端 tip 的现有快照校验与 selected ongoing source branch 校验继续生效。
- [x] CLI 帮助和文档说明各目标的 snapshot、diff baseline、是否联网及适用的 CI 或本地工作流。
- [x] 自动化测试覆盖违规和合规目标、旧违规历史、参数冲突、merge commit、初始 commit、index/worktree 隔离及现有 source branch 失败场景。

## Constraints

- 沿用配置中的 credential-free primary repository URL 和 primary branch，不依赖 clone-local remote 名称。
- 不签出或修改调用者的 branch、index、staged files 和无关工作树内容。
- `--commit`、`--staged` 和 `--unstaged` 不隐式 fetch；只有 `--remote` 访问配置的远端 repository。
- staged 与 unstaged 模式必须从 Git 对象和 index 构造待校验快照，不能通过临时修改调用者工作树实现。
- 保持现有诊断和 JSON report 契约兼容；如需调整描述，应保留可操作的 remediation。
- 历史中的旧问题通过后续正向提交处理，当前提交检查不得要求改写共享历史。

## Human review checkpoints

Task creation records this plan, not approval.

| Checkpoint | Applicability | Reviewer | Planned review artifact | Approval required before |
| --- | --- | --- | --- | --- |
| Scope | Required | User or accountable owner | 本文的目标、范围、非目标、约束和验收标准。 | Substantive implementation. |
| Interface | Required | User or accountable owner | `--remote`、`--commit`、`--staged` 和 `--unstaged` 的互斥规则、目标语义、诊断兼容性及 CI/本地使用方式。 | Implementing the affected interface. |
| Business and data model | Not applicable: 不改变 lifecycle record、schema 或持久化业务数据。 | Not applicable | Not applicable | Not applicable |
| Architecture | Not applicable: 沿用现有 check、Git helper 和临时 worktree 边界。 | Not applicable | Not applicable | Not applicable |
| Delivery acceptance | Required | User or accountable owner | 已发布实现、自动化验证结果和代表性 CI 命令输出。 | Running `task complete` for the exact approved primary commit. |

## References

- [Remote check implementation](../../src/index.js)
- [CLI documentation](../../README.md)
- [Remote publication tests](../../test/publication.test.js)
- [Repository task profile](../../docs/repository-tasks.md)