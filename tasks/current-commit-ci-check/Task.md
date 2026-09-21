# 将远端检查收缩到当前提交

Created: 2026-09-21
Language: zh-CN

## Goal

`repoledger check --remote` 面向 CI 校验远端主分支的当前 tip 快照，并且只对该
tip commit 执行提交级 `Progress.md` 策略检查，不再遍历既有 commit history。

## Context

当前 `check --remote` 除了校验远端主分支快照和 ongoing task 的 source ref，还会
从 `status.yaml` 引入后遍历主分支的一方历史，逐个 commit 检查是否存在仅修改
`Progress.md` 的记账提交。这使检查成本随仓库历史持续增长，而且历史违规即使已用
正向提交修复，后续检查仍会永久失败。CI 只需要判定当前发布 commit 和当前共享
状态是否合规。

## Scope

- 将提交级 `Progress.md` 策略检查限制为远端主分支当前 tip commit 相对其第一父提交的变化。
- 保留当前远端主分支 tip 的配置、ledger、任务工件和本地链接等快照校验。
- 保留 selected ongoing task 的 source branch 可用性和 start ancestry 校验。
- 为普通提交、merge commit、初始 commit 及历史中已有违规但当前 tip 合规的情况定义确定性行为。
- 更新 CLI 帮助、用户文档和自动化测试，使 `--remote` 的 CI 语义明确且可验证。

## Out of scope

- 审计或修复远端主分支的完整历史。
- 改写、删除或豁免既有 commit。
- 改变不带 `--remote` 的工作树快照校验语义。
- 改变任务生命周期、source ref 发布或完成规则。

## Acceptance criteria

- [ ] `repoledger check --remote` 不再枚举远端主分支的 commit history，检查成本不随历史 commit 数量线性增长。
- [ ] 当前 tip commit 修改任一 task 的 `Progress.md` 且未修改 `tasksDirectory` 外的 tracked path 时，远端检查失败并返回明确诊断。
- [ ] 当前 tip commit 的 `Progress.md` 变化同时伴随 `tasksDirectory` 外的 tracked path 变化时，提交级检查通过。
- [ ] 既有历史包含 progress-only commit、但当前 tip 合规时，远端检查不会因旧提交失败。
- [ ] merge commit 和无父提交的 tip 行为有明确测试，不会回退为全历史扫描。
- [ ] 远端 tip 的现有快照校验与 selected ongoing source branch 校验继续生效。
- [ ] CLI 帮助和文档明确说明 `--remote` 校验当前远端主分支 tip，并适合作为 CI 检查。
- [ ] 自动化测试覆盖违规 tip、合规 tip、旧违规历史、merge commit、初始 commit 及现有 source branch 失败场景。

## Constraints

- 沿用配置中的 credential-free primary repository URL 和 primary branch，不依赖 clone-local remote 名称。
- 不签出或修改调用者的 branch、index、staged files 和无关工作树内容。
- 保持现有诊断和 JSON report 契约兼容；如需调整描述，应保留可操作的 remediation。
- 历史中的旧问题通过后续正向提交处理，当前提交检查不得要求改写共享历史。

## Human review checkpoints

Task creation records this plan, not approval.

| Checkpoint | Applicability | Reviewer | Planned review artifact | Approval required before |
| --- | --- | --- | --- | --- |
| Scope | Required | User or accountable owner | 本文的目标、范围、非目标、约束和验收标准。 | Substantive implementation. |
| Interface | Required | User or accountable owner | `check --remote` 的 CLI 语义、诊断兼容性和 CI 使用方式。 | Implementing the affected interface. |
| Business and data model | Not applicable: 不改变 lifecycle record、schema 或持久化业务数据。 | Not applicable | Not applicable | Not applicable |
| Architecture | Not applicable: 沿用现有 check、Git helper 和临时 worktree 边界。 | Not applicable | Not applicable | Not applicable |
| Delivery acceptance | Required | User or accountable owner | 已发布实现、自动化验证结果和代表性 CI 命令输出。 | Running `task complete` for the exact approved primary commit. |

## References

- [Remote check implementation](../../src/index.js)
- [CLI documentation](../../README.md)
- [Remote publication tests](../../test/publication.test.js)
- [Repository task profile](../../docs/repository-tasks.md)