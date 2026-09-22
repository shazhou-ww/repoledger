# 以 whatsnext 驱动 Agent 任务循环

Created: 2026-09-22
Language: zh-CN

## Goal

Repoledger 提供只读的 `repoledger whatsnext [task]` 接手接口，把 primary 上的粗粒度
task lifecycle、task source branch 上的细粒度 phase、累计 Git 变更、结构化任务证据、
项目/全局配置与当前 worktree 规范化成稳定 snapshot，再以纯函数生成一段 Agent 可执行
的 prompt。Agent 执行 prompt 后推动声明输入发生变化，重新查询，或在 human/external
input、可操作错误及 no-progress 边界安全停止。

## Context

当前 skill 在接手任务时分别调用 task list、status 和 remote check，再读取 Task、Progress
等文件自行解释下一步，增加工具往返、token 消耗和不同 Agent 之间的行为漂移。现有
`ongoing` 又同时覆盖规划、实现和交付收尾，无法直接决定当前允许修改的路径和应加载的
项目 prompt。

Planning、implementing 和 finalizing 应是 `ongoing` 内部、只存在于 advertised task
source branch 的 phase；primary `tasks/status.yaml` 在三者期间始终只记录 `ongoing`。Phase
边界由 Repoledger 创建的独立 State transition commit 标记，检查约束针对该 phase base
之后到 candidate 的全部累计变更，而不是只看最近一次 commit。

详细数据结构、Git history contract、phase-base 推导、累计 range 算法、事务协议与失败
恢复以 [详细设计](./Design.md) 为规范来源。

## Scope

- 增加无子命令的只读 `repoledger whatsnext [task]`，提供面向 Agent 的文本输出和稳定
  JSON 协议，并默认刷新 authoritative primary 与 active source ref。
- 保持 primary lifecycle 为 `backlog`、`ongoing`、`completed` 和 `abandoned`；新增显式
  terminal reactivation 与低频 generation identity，但不把 active phase 写入 status。
- 在 task folder 中增加唯一的规范 `State.yaml`，保存当前 generation、phase、通用
  project-defined guidance item results、phase transition decision 与 closure；核心不内建
  reviewer、acceptance criterion、test、deployment 或其他领域分类。
- 使 `State.yaml` 和 `tasks/status.yaml` 只能通过意图明确的 Repoledger 命令修改；每次
  State mutation 使用 expected-tip CAS、规范序列化、独立 commit 和非强推 publication。
- 用 task source first-parent history 中最近一个合法 `phase-entered` State commit 推导当前
  phase base；commit title/trailer 只辅助定位，结构化 parent/child State 差异才是依据，
  不使用 tag，也不持久化 base hash。
- 让 validator 同时计算 phase base 到 candidate 的 cumulative changed-path union 与 net
  tree delta，并支持 committed、staged synthetic、local worktree 和 fetched remote candidate。
- 对完整 source history 重建并验证所有已关闭 phase interval、当前 interval 及每个独立
  transition commit，避免跳过 hook 或后续 revert 掩盖历史违规。
- Planning/finalizing range 硬性限制为当前 task folder；implementing range 允许项目变化，
  并在 checkpoint、requery 和 phase close 边界累计验证 repository-declared journal、State
  与通用 guidance requirements，不要求某一个 commit 同时包含 task folder 内外变化。
- 支持项目配置按 planning、implementing、finalizing 注入可选 prompt；核心 lifecycle、
  phase permissions、审批、发布和安全规则不可覆盖，finalization instructions 在进入 phase
  时冻结。
- 由当前 branch canonical push target 与 task source target 推导 worktree binding，不创建
  worktree-local task metadata；一个 worktree 同时最多修改一个 active task。
- 让 observation 输出 staged/unstaged/untracked/conflict facts、local/source/primary ancestry
  和 phase path legality；Agent 分类必要工作、来源明确的临时产物与未知现有工作，未知或
  无关变更默认保留隔离，`whatsnext` 不自动 reset、clean、stash 或覆盖。
- 对 clean fast-forward gap 输出可由显式 Repoledger sync 自动执行的 step；dirty、ahead 或
  diverged 状态分别进入安全 commit/publication/integration guidance，不从 stale refs 猜测。
- 更新 Repoledger skill，使 `exec`、`complete` 和 `abandon` 复用 whatsnext loop；在声明
  delta 后刷新，需要 human/external input 时 yield，在错误或 no-progress 时停止。
- 更新存储 schema、CLI、checker、Git hooks/CI 指南、README、adoption/task workflow
  文档和自动化测试，并为 legacy ongoing task 提供不依赖文本猜测的显式 phase migration。

## Out of scope

- 执行任意 shell hook、加载可执行插件，或把 Repoledger 建成通用 workflow engine、
  scheduler 或事件总线。
- 用 `whatsnext` 取代实现期间按需进行的源码调查、测试、调试或领域工具调用。
- 让项目 prompt 覆盖平台安全规则、工具权限、Repoledger lifecycle/phase 不变量或 human
  approval 要求。
- 从 Task/Progress 自由文本、沉默、普通 Git 活动或 invocation 本身推断 human decision。
- 允许直接手工编辑 `State.yaml` 或 `tasks/status.yaml`，或提供绕过合法事件的通用 setter。
- 用 tag、Git note、worktree-local marker 或 force-push 维护 phase identity。
- 允许 squash/rebase 擦除已发布 source phase history，或删除旧 source branch 作为 lifecycle
  副作用。
- 在 `State.yaml` 中保存 secret、签名 URL、当前 transaction commit、future commit、phase
  base 或只作为 cache 的 source/primary tip。
- 证明 State transaction 是由特定二进制或真人身份创建；本任务保证结构与状态机合法性，
  signed actor identity 属于独立 governance 能力。

## Acceptance criteria

- [ ] Primary `tasks/status.yaml` 在 planning、implementing 和 finalizing 期间始终记录
  `state: ongoing`；coarse lifecycle、generation 和 source identity 与 phase state 职责清晰。
- [ ] `State.yaml` 使用 strict canonical schema，在一个文件中保存当前 generation、phase
  及通用 guidance item/transition/closure 状态；item ID 和语义由项目定义，未知字段、非法
  stable ID、秘密内容和不允许的 hash 被拒绝。
- [ ] Agent 和用户不直接编辑 State/status；Repoledger 的意图命令使用 expected source
  tip 或 snapshot digest 做 CAS，并创建可恢复、非强推发布的独立机器状态 commit。
- [ ] Start transaction 在 primary 创建 `backlog -> ongoing` status commit，并在 source
  创建以它为 parent 的 `phase: planning` State commit；同仓库场景使用 atomic push。
- [ ] Phase transition commit 是单父、State-only、generation 不变且 transition 合法的
  Repoledger event；evidence-only State commit 不会被误认为 phase marker。
- [ ] Current phase base 由 source first-parent history 中最近一个合法 transition commit
  唯一推导；base 不写入任何文件，重复进入同一 phase 时最近 marker 生效。
- [ ] Source history 禁止 force-push/rebase；同步 primary 时 source tip 保持 first parent；
  primary integration 保留 source-tip ancestry，squash integration 被拒绝。
- [ ] Checker 对 phase range 计算每个 first-parent commit 相对 parent 的 path union，并另算
  base tree 到 candidate tree 的 net delta；禁止路径即使后来 revert 仍会被发现。
- [ ] `check --commit`、`check --staged`、local worktree check 和 `check --remote` 使用同一
  range engine；staged candidate 合并既有历史与 index overlay，remote fetch 失败不使用旧 ref。
- [ ] CI 从 source history 重建全部 transition marker，逐一验证 closed phase intervals、
  当前 interval 和 transition commit；手工伪造或跳过本地 hook 不能隐藏历史违规。
- [ ] Planning/finalizing 的累计 path union 只能包含当前 task folder；任何 project path 或
  `tasks/status.yaml` 变化均被拒绝，Repoledger lifecycle commit 按独立协议校验。
- [ ] Implementing 的累计 range 可包含多个 code-only 或 task-only commits；checkpoint、
  source publication、whatsnext requery 和 finalizing transition 检查累计 external delta、
  repository-declared journal/State facts 与 generic item freshness，不再要求 same-commit pairing。
- [ ] 所有持久 commit hash 在 State transaction 前已经存在，并解析为 transaction parent
  或其祖先；current/self、descendant、future、phase-base 和 cache hash 被拒绝。
- [ ] 实现进入 primary 后，以 source 为 first parent 同步 primary、冻结具体 finalization
  instructions，再创建 finalizing marker；primary status 仍保持 ongoing。
- [ ] Ongoing 时 source State 权威，terminal/backlog 时 primary State envelope 权威；
  Completion/abandonment 使用独立 primary lifecycle commit 更新 coarse status 与 closure，
  只引用已经存在的 ancestor，不夹带实现或无关 task changes。
- [ ] Reactivation 明确绑定 terminal generation，递增 generation、返回 backlog，并在后续
  start 使用新的 source identity；旧 generation 与 source history 保持可审计。
- [ ] Worktree binding 只比较 canonical push target 与 effective task source target；remote
  alias、detached HEAD、未知 URL identity 和多重匹配均得到确定的保守处理。
- [ ] Snapshot 明确包含 dirty worktree 与 local/source/primary relation；必要 task changes
  通过精确 staging 和累计检查提交，只有当前操作创建或 cleanup policy 明确识别的临时产物
  可自动删除，未知/无关既有变更被保留并通过独立 worktree 或明确决定处理。
- [ ] `whatsnext` 只 fetch/observe，不修改 checkout；clean behind source/primary 可由后续显式
  sync step 做 `ff-only`，ahead 走 checkpoint publication，diverged 走非强推 integration，
  dirty 状态在同步前先安全协调。
- [ ] `repoledger.yaml` 可配置安全的 phase prompt paths；planning approval 绑定当前 Task 和
  compiled planning bundle digest，finalization steps 在进入 phase 时冻结且不会被后续配置
  变化隐式扩展。
- [ ] Guidance pipeline 明确拆成 `route`、`observe`、`render` 和 `advance`；selection、I/O、
  Git ancestry、human/external outcome 与 before/after 比较不会伪装成单 snapshot predicate。
- [ ] `whatsnext` prompt 包含当前 macro-step、完成条件、expected delta、requery/yield/error
  边界和 phase contingency；相同 snapshot 产生相同输出，无 delta 时不会空转。
- [ ] Git hook、Repoledger mutation/publication command 和 required CI 复用共享 validator；
  branch protection 是 primary enforcement boundary，本地 hook 不是信任边界。
- [ ] Legacy ongoing task 缺少合法 phase marker 时返回 migration-required；只有显式 phase
  选择能创建初始 marker，不从 Task/Progress 文本猜测。
- [ ] 自动化测试覆盖 [详细设计](./Design.md) 的 required test matrix，且 `pnpm check`、
  package check、installed-package smoke 与 skill validation 全部通过。

## Constraints

- `whatsnext` 本身只读；状态转换、State evidence、发布和外部副作用继续通过显式命令或
  受控系统完成。
- Active source `State.yaml` 的每次修改都是独立 Repoledger State-only transaction commit；
  coarse completion/abandon/reactivate 可在独立 primary lifecycle commit 中原子修改 status
  与当前 task State。其他 task artifact 先提交，State evidence 只能引用该 commit 或更早
  祖先，避免自引用。
- Phase transition commit 本身是新 phase base且不计入该 phase range；它由 checker 单独
  验证，关闭前一个 phase 时先验证 parent 处的完整累计区间。
- Cumulative path union 与 net tree delta 均为必要输入，不能用单 commit diff 或单一净 diff
  替代。
- Planning/finalizing 不同步带有 project changes 的 primary；implementing 可通过 source
  first-parent merge 同步并承担对应累计 range。
- Human reply、外部系统结果和 Agent 的语义发现是 execution outcome；只有写入结构化 State
  transaction 后才影响下一次 deterministic guidance。
- Repoledger 只判断 Git shape、phase path legality 和结构化 item 状态，不判断任意 dirty
  content 的业务归属；未知现有工作不因 Agent 推断“无关”而自动丢弃。
- Git history 已记录 transition commit identity，因此 State/status 不复制 phase base；任何
  persisted hash 都必须通过 ancestor 与语义角色校验。
- 同任务并发依靠 expected-tip CAS 和非强推 push 检测；不同任务通过独立 worktree 隔离。
- 不得回退、覆盖或重写其他人的 primary/source work；恢复只追加合法历史或重发既有 tip。

## Human review checkpoints

Task creation records this plan, not approval.

| Checkpoint | Applicability | Reviewer | Planned review artifact | Approval required before |
| --- | --- | --- | --- | --- |
| Scope | Required | User or accountable owner | 本文的 Goal、Context、Scope、Out of scope、Acceptance criteria 与 Constraints。 | Substantive implementation. |
| Interface | Required | User or accountable owner | [详细设计](./Design.md) 中的 command/event、State schema、prompt extension、whatsnext text/JSON 与 migration contract。 | Implementing the affected interface. |
| Business and data model | Required | User or accountable owner | [详细设计](./Design.md) 中的 coarse lifecycle、source phase graph、generation、State evidence、closure/reactivation 与 hash rules。 | Implementing the affected model. |
| Architecture | Required | User or accountable owner | [详细设计](./Design.md) 中的 authority split、first-parent contract、phase-base derivation、range engine、worktree binding、validator 与 enforcement layers。 | Implementing the affected module boundaries and control loop. |
| Delivery acceptance | Required | User or accountable owner | 已发布实现、完整验证结果及 start、phase range、State transaction、human yield、finalization、completion 与 reactivation 的代表性演示。 | Running `task complete` for the exact approved primary commit. |

## References

- [Detailed design](./Design.md)
- [Repoledger skill](../../skills/repoledger/SKILL.md)
- [Repository task profile](../../docs/repository-tasks.md)
- [CLI implementation](../../src/cli.js)
- [Repository checker](../../src/index.js)
- [Git primitives](../../src/git.js)
- [Task publication](../../src/publication.js)
- [Task ledger](../../src/ledger.js)
- [Version 2 schema](../../schema/v2.json)
- [npm package release workflow](../../docs/npm-package-releases.md)