# 以 whatsnext 驱动 idea 协作循环

Created: 2026-09-22
Language: zh-CN

## Goal

Repoledger vNext 以 remote primary 中长期存在的 idea 为协作单位，提供只读的
`repoledger whatsnext [idea]` 导航接口。命令从 idea definition、最小 status、Git history、
worktree 和 refreshed primary snapshot 纯推导当前状态与唯一优先的下一步；Agent 执行后通过
普通 Git 产生可观察变化并重新查询，或在等待 human/external input、可操作错误及 no-progress
边界安全停止。

## Context

现有 v2 使用中央 task ledger、持久 lifecycle、强制 source branch 和多组 lifecycle commands。
在继续叠加 phase state 与 transition schema 前，本任务重新审视了产品边界，并决定采用更小的
idea model：idea folder 保存共同期待，sibling status 只保存不可推导的 acceptance facts，
state 由当前 idea tree revision 纯推导。

这是一项明确获批的 breaking redesign，不要求 vNext runtime 与 v2 双模式共存。现有 v2
repository 在显式转换前继续使用 v2 release；vNext 不静默迁移或解释旧 storage。

规范评审 artifact 为 [Repoledger vNext 设计提案](./Design.md)。旧 phase-loop 设计由 Git
history 保留，不再约束实现。

## Scope

- 定义 `ideas/<ULID>/` 与 sibling `ideas/<ULID>.status.yaml` layout、ULID identity、唯一 alias
  和 Git subtree OID `ideaRevision`。
- Status 只保存 `version`、`id`、`alias`、可选 `abandoned` 及三个 revision acceptance；不保存
  派生 state、guidance、criteria mirror、source branch 或 transition edge。
- 从当前 idea revision 与 status 纯推导
  `preparing | implementing | deploying | completed | abandoned`。
- 实现只读 `repoledger whatsnext [idea]`：先 refresh remote primary，再执行 selection、结构
  诊断、worktree hygiene、primary reconciliation 与 state guidance 的有序规则链。
- 实现 `repoledger check` 对 layout、schema、canonical serialization、alias、tree OID binding、
  history evidence 和 repository-owned path 安全性的本地及完整历史校验。
- `whatsnext` 输出 `observedPrimaryCommit` 与 `ideaRevision`，但不编辑文件、不 commit、不 merge、
  不 push；approval/acceptance/abandonment 由普通文件编辑、`check`、commit 与 non-force push
  表达。
- vNext 协议只以 configured primary 为 authority；feature branch 是可选传输手段，不进入
  status、state derivation 或 checker contract。
- `Idea.md` 只要求存在，不规定固定章节；idea folder 中其他 narrative artifacts 由项目自由
  组织，folder 的任意变化都会生成新 revision 并使旧 acceptance 自然失效。
- 更新 CLI、schema、checker、skill、README、adoption 文档、pack/smoke 和自动化测试，覆盖
  最终获批的接口、数据模型、迁移诊断与协作安全语义。
- 将 `repoledger` package version 更新为 `0.9.1`，并通过受保护的 npm release workflow
  发布该版本。

## Out of scope

- vNext runtime 与 v2 task model 的双模式兼容层。
- 首版 in-place migration command 或自动转换旧 `tasks/status.yaml`。
- Approval、acceptance 或 abandonment mutation subcommands。
- 强制每个 idea 使用 feature/source branch、commit trailer 或 repository 可证明的 work lock。
- `Idea.md` 固定章节、criteria work-item tracking 或逐项 acceptance mirror。
- 持续监控外部世界，或把一次 deployment acceptance 当作永久事实。
- 执行任意 shell hook、加载可执行插件，或把 Repoledger 建成通用 workflow engine、scheduler
  或事件总线。
- 自动删除、reset、clean、checkout、覆盖或静默 stash 未知来源及用户已有 changes。
- Force-push、静默重放过期 acceptance，或重写 shared primary history。

## Acceptance criteria

- [ ] 当前 canonical Idea 与设计 artifact 的 narrative 使用 `zh-CN`，命令、标识符、
  协议值与原样工具输出保持技术形式。
- [ ] vNext schema 表达 ULID folder、sibling status、唯一 alias、optional abandonment 与三个
  revision acceptance 字段，且禁止显式 derived state、criteria mirror 和 source locator。
- [ ] `ideaRevision` 使用当前 repository object format 的 idea subtree OID；checker 验证其为
  tree object，并能在完整 primary history 中证明首次写入时与 candidate tree 一致。
- [ ] 状态严格按 `abandoned`、`approvedRevision`、`implementationAcceptedRevision`、
  `deploymentAcceptedRevision` 的有序纯函数推导为五个互斥值。
- [ ] `repoledger whatsnext [idea]` 在一次不可变 `observedPrimaryCommit` 上完成 refresh、selection、
  validation、worktree/primary reconciliation 与 state guidance，并一次只输出最高优先动作。
- [ ] 无参数时对 active ideas 给出零个、一个或多个的确定性选择指导；显式 ULID 或唯一 alias
  可查询 terminal idea。
- [ ] Dirty/conflict/behind/ahead/diverged 规则保留未知或用户已有工作，不自动 reset、clean、
  checkout、stash、merge、commit、push 或删除路径。
- [ ] `whatsnext` 保持只读；所有 status mutation 使用普通文件编辑、candidate check、独立 commit
  与 non-force push，并在 primary tip 变化后重新观察而不是重放过期判断。
- [ ] vNext 仅实现 single-primary 协议；feature branch 不进入 status 或 state derivation。
- [ ] `Idea.md` 仅要求存在，不校验固定章节；idea folder 的任意 tree change 都使旧 acceptance
  对新 revision 自然失效。
- [ ] vNext 对 v2 storage 返回明确 `migration-required`，不提供 runtime 双模式、静默转换或首版
  in-place migration command。
- [ ] CLI、schema、checker、skill、README、adoption 文档和自动化测试覆盖状态矩阵、history
  binding、worktree 安全、breaking cutover、pack、installed-package smoke 与 skill validation。

## Deployment acceptance criteria

- [ ] Immutable tag `npm/repoledger/v0.9.1` 触发的 `Publish npm package` workflow 成功，且
  `npm view repoledger@0.9.1 version --registry=https://registry.npmjs.org/` 返回 `0.9.1`，
  `npm view repoledger dist-tags.latest --registry=https://registry.npmjs.org/` 也返回 `0.9.1`。
- `npm/repoledger/v0.9.0` 及 workflow run `35878855657` 保留为不可变失败审计记录，不移动、
  删除、重建或作为本轮 deployment acceptance。

## Constraints

- 未经 Interface、Business/data model 和 Architecture review，不开始生产实现或固定最终 schema
  version/config field names。
- `whatsnext` 只由 declared observation 决定，不读取隐藏 session memory 或猜测 human decision。
- Remote primary snapshot 先于 local worktree 与 idea guidance；高优先级诊断返回后不输出低优先
  status mutation 或外部副作用。
- 同一 observation 一次只给出一个最高优先方向；只有可观察 delta 才触发下一次查询，无变化时
  yield、报告 actionable error 或 no-progress。
- Unknown changes、并发 primary work 与历史 acceptance 一律保留；不得 force-push、reset 或用
  stale decision 覆盖新 primary。
- npm 发布只能由 `.github/workflows/publish-npm.yml` 的 protected tag 与 trusted publishing
  完成；不得在开发机运行 `npm publish`，不得创建 npm token，也不得移动或重建 release tag。

## Human review checkpoints

Task creation records this plan, not approval.

| Checkpoint | Applicability | Reviewer | Planned review artifact | Approval required before |
| --- | --- | --- | --- | --- |
| Scope | Required | User or accountable owner | 本文与 [Repoledger vNext 设计提案](./Design.md) 的 breaking redesign 边界。 | Substantive implementation. |
| Interface | Required | User or accountable owner | `whatsnext [idea]`、`check`、selector/output、普通 Git status mutation 与 migration-required diagnostics。 | Fixing command, JSON, diagnostics, or config interfaces. |
| Business and data model | Required | User or accountable owner | Idea/status layout、ULID/alias、tree revision、acceptance facts 与纯状态推导。 | Adding or implementing vNext schema fields. |
| Architecture | Required | User or accountable owner | Primary authority、single-primary worktree discipline、history validation、non-force CAS publication 与 breaking cutover。 | Implementing vNext observation, validation, rendering, or publication support. |
| Delivery acceptance | Required | User or accountable owner | 已发布实现、完整验证结果、`npm/repoledger/v0.9.1` workflow 成功证据与 npmjs registry/version/dist-tag 查询结果。 | Recording deployment acceptance for the approved idea revision. |

## References

- [Repoledger vNext design](./Design.md)
- [Repoledger skill](../../skills/repoledger/SKILL.md)
- [Repository task profile](../../docs/repository-tasks.md)
- [CLI implementation](../../src/cli.js)
- [Repository checker](../../src/index.js)
- [Git primitives](../../src/git.js)
- [Idea model](../../src/ideas.js)
- [Version 3 schema](../../schema/v3.json)
