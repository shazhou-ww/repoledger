# 以 whatsnext 驱动 Agent 任务循环

Created: 2026-09-22
Language: zh-CN

## Goal

Repoledger 提供只读的 `repoledger whatsnext [task]` 接手接口，把任务 record、task
folder、当前 worktree、项目与全局配置以及 remote primary 规范化为一个稳定 snapshot，
再以纯函数生成一段可执行 prompt。Repoledger skill 持续执行 prompt 所指示的工作，
推动可观察输入变化后重新查询，并可为 human input 暂停和恢复，直到任务完成、放弃
或由用户调整目标后重新进入生命周期。

## Context

当前 skill 在每次接手任务时分别调用 task list、status 和 remote check，并读取
`Task.md`、`Progress.md`、`UserAcceptance.md` 等文件后自行解释下一步。这增加工具
往返、token 消耗和 latency，也让不同 Agent 对生命周期规则的执行容易漂移。

项目还可能在开始、交付准备或任务完成后需要不同的上下文和 follow-up，例如判断
是否应发布 npm package、触发线上部署或更新外部 issue。把这些需求实现为任意命令
hook 会混淆只读指导与外部副作用，也难以定义重试、审批和幂等语义。Repoledger
需要一个受限的项目 prompt 扩展模型，并由统一的下一步接口在恰当阶段按需注入。

当前 `ongoing` 同时表示计划评审、代码实现和交付收尾，无法仅凭 task record 判断允许
修改哪些路径或应加载哪类 prompt。`completed` 又发生在部署、smoke test 或人工验收
之前时，任务虽已终止却仍有必须追踪的工作。生命周期需要显式区分 planning、
implementing 和 finalizing，并让 completed/abandoned 只表示经人确认的终态。

## Scope

- 增加无子命令的只读 `repoledger whatsnext [task]` 接口，提供面向 Agent 的文本输出
  和稳定 JSON 协议，并默认刷新 authoritative primary。
- 把任务生命周期扩展为 `backlog`、`planning`、`implementing`、`finalizing`、
  `completed` 和 `abandoned`，定义合法 transition、active source ref、终态 reactivation
  及旧 `ongoing` record 的确定性兼容或迁移规则。
- 以六类可观察输入形成规范 snapshot：单条 task record、task folder 最近一次 Git
  变更及其内容、当前 project worktree 的 HEAD 与 changes、`repoledger.yaml` 及其 prompt
  配置、全局 Repoledger 配置、remote primary 当前 hash。
- 把 snapshot 到 prompt 的映射实现为可表驱动测试的纯函数；每条规则均表达为“在某种
  可观察情况下，应该指示 Agent 执行某项工作”，并声明完成该工作预期改变的输入、
  重新查询条件和 human/external yield 条件。
- 在项目配置中支持可选、具名且按 lifecycle phase 加载的 prompt extensions；核心
  lifecycle、安全与审批规则不可覆盖，UX、架构、数据、安全、发布和部署等项目关注点
  可按 phase 定制，而非全部写死在 Repoledger skill 中。
- 使 `planning` 和 `finalizing` 成为硬性 task-folder-only 阶段；`implementing` 允许修改
  项目内容，但以 implementation checkpoint 而非每个 Git commit 为 Progress 配对和
  `whatsnext` 重查边界。
- 让 `finalizing` 承载部署、smoke test、manual acceptance 和其他外部 follow-up，并把
  可恢复结果写入 task folder；需要修改实现时先回到 `implementing`，需要改变目标时
  先回到 `planning`。
- 允许显式查询 `completed` 或 `abandoned` 任务时询问用户是否调整目标；用户确认调整
  后，原子修订任务契约、推进新的 lifecycle generation 并 reactivate 到 `backlog`，
  同时保留上一轮结果和 Git 历史。
- 规定一个 worktree 同时最多绑定一个会产生修改的 Repoledger task；同一 repository
  通过独立 worktree 并行处理多个任务，只读查询不受该限制。
- 以共享 validator 为唯一规则实现：Repoledger transition/publication 命令强制调用，
  Git hooks 提供可选的本地快速反馈，required CI 与 branch protection 构成 primary 的
  最终 enforcement boundary。
- 更新 Repoledger skill，使 `exec`、`complete` 和 `abandon` 复用同一个 whatsnext
  loop：执行当前 prompt、在产生预期输入变化后重新查询、需要用户决定时 yield，并在
  无进展或终态确认时停止；保留 `new` 只登记 backlog 后停止的现有边界。
- 更新配置 schema、CLI 帮助、README、adoption/task workflow 文档和自动化测试，说明
  lifecycle、prompt 信任边界、loop 语义、路径权限、worktree 绑定、恢复与兼容行为。

## State machine design

`tasks/status.yaml` 中单条 canonical task record 保存 lifecycle state。建议 transition
graph 如下；具体命令名称和 JSON disposition 字段由实现时根据完整 statements 推导，
不先以 harness 术语反推状态模型。

| Record state | Legal ledger transitions | Source ref | Allowed durable effects |
| --- | --- | --- | --- |
| `backlog` | `planning`、`abandoned` | Forbidden | 等待开始或放弃决定；不执行任务实现。 |
| `planning` | `implementing`、`abandoned` | Required | 仅修改当前 task folder，按 planning prompts 完善并评审契约。 |
| `implementing` | `planning`、`finalizing`、`abandoned` | Required | 可修改项目和 task folder；以 checkpoint 记录有意义的实现进展。 |
| `finalizing` | `planning`、`implementing`、`completed`、`abandoned` | Required | 仅修改当前 task folder及操作外部系统；部署、smoke test、验收结果形成 receipt。 |
| `completed` | `backlog` via reactivate | Forbidden | 已确认没有剩余工作；仅在显式查询时询问是否调整目标。 |
| `abandoned` | `backlog` via reactivate | Forbidden | 已确认终止当前目标；仅在显式查询时询问是否调整目标。 |

`absent -> backlog` registration 不属于已注册 record transition。Primary 中存在 task
folder 但没有 status record 时得到的 `unregistered` 是 layout 投影，不是 lifecycle state；
missing、unregistered、选择歧义和无效 record 返回结构化诊断或 selection result。

`backlog -> planning` 建立 advertised source branch，并使执行 worktree 与该任务绑定。
`planning -> implementing` 只能发生在计划及所有适用 review gate 获得明确批准后。
`implementing -> finalizing` 要求实现已验证并进入 remote primary，同时在 task record 中
绑定精确 implementation commit，后续部署和验收均以该目标为准。`finalizing -> completed`
要求配置的 follow-up、manual acceptance 和最终 human confirmation 均已满足。

Finalizing 中发现实现、配置、文档、schema 或 workflow 需要变化时，先 transition 回
`implementing`，再修改 task folder 外路径；发现目标、scope 或计划本身需要变化时，先
回到 `planning`。Transition commit 由 Repoledger 原子修改精确的 ledger-owned path，
不得夹带其他变化。

Completed/abandoned 不参与默认活跃任务选择。用户显式查询终态任务时，`whatsnext`
询问是否调整目标；否定回答直接停止，不要求输入变化。肯定回答允许 Agent 先拟定任务
契约修订，经确认后由 reactivate 操作原子发布修订、增加持久 lifecycle generation 并
返回 `backlog`。新 generation 使用不冲突的 source branch identity，旧结果、commit 和
终态决定继续保留在 Git 历史中。

旧 version 2 `ongoing` record 无法可靠区分 planning、implementing 或 finalizing。迁移
不得通过 Task/Progress 文本或工作树启发式静默猜测；实现必须提供确定、可审计且不会
越过既有 review gate 的兼容或显式迁移路径。

## Guidance function

`whatsnext` 先执行有 I/O 的 observation，再调用纯 projection：

$$
S = observe(taskRecord, taskFolderRevision, worktree, projectConfig,
globalConfig, remotePrimary)
$$

$$
Prompt = render(S)
$$

规范 snapshot 只由以下输入构成：

1. `tasks/status.yaml` 中对应的单条 task record。
2. 当前 task folder 最近一次 Git 变更 hash，以及该 revision 对应的任务工件内容。
3. 当前 project worktree 的 HEAD hash 和规范化 changes。
4. 当前 revision 的 `repoledger.yaml` 与其引用的 phase prompt 内容。
5. 当前用户的全局 Repoledger 配置。
6. Remote primary branch 的当前 hash。

Snapshot 具有稳定 digest。相同 snapshot 必须产生相同 prompt；任一输入在 observation
期间变化时丢弃候选结果并重新观察。Prompt 至少表达 instruction、完成条件、预期输入
变化和重新查询条件。读取、调查和测试可以发生在一个 macro-step 内，不要求每个动作都
改变输入；只有预期变化已发生时才重新调用 `whatsnext`。需要 human input 或外部等待时
Agent yield；没有输入变化、等待理由或可操作错误时停止并报告 no progress，禁止空转。

外部部署、registry 或 smoke-test 状态不直接属于输入。Finalizing prompt 可以要求 Agent
调用外部工具观察或产生副作用，但其结果必须写入 task folder 的结构化 receipt，使下一
次 task folder revision 变化并能确定性地产生后续 prompt。不可回滚动作采用
observe-before-act；无法形成 receipt 的动作不得放入自动重查 loop。

## Guidance statements

- 在配置、task record 或 snapshot 无效的情况下，应该指示 Agent 报告可操作诊断并停止。
- 在任务不存在或无法唯一选择的情况下，应该指示 Agent 请求明确选择且不修改状态。
- 在 prompt 绑定的 snapshot 已过期的情况下，应该指示 Agent 放弃剩余 instruction 并
  重新查询。
- 在当前 worktree 已绑定另一非终态任务或含无法归属的 changes 的情况下，应该指示
  Agent 保留现状并使用独立 worktree。
- 在 `backlog` 任务被明确执行的情况下，应该指示 Agent 建立 task source worktree、
  transition 到 `planning` 并重新查询。
- 在 `planning` 的情况下，应该指示 Agent 只修改当前 task folder，使用核心要求和项目
  planning prompts 完善计划，并向用户请求绑定权威 artifact 的明确评审决定。
- 在 `planning` 出现 task folder 外 changes 的情况下，应该指示 Agent 停止发布、保留
  changes，并在合法 transition 或隔离后处理，不能把实现伪装成计划。
- 在 planning review 尚未批准的情况下，应该指示 Agent yield，不进入实现。
- 在计划获得所有适用批准的情况下，应该指示 Agent transition 到 `implementing` 后再
  修改项目内容。
- 在 `implementing` 且存在未满足验收条件的情况下，应该指示 Agent继续实现、验证并
  准备下一次 implementation checkpoint。
- 在一个 macro-step 包含多个实现 commit 的情况下，应该允许中间 commit 只修改项目；
  但在发布 checkpoint 或重新调用 `whatsnext` 前，应该指示 Agent 以至少一个同时包含
  项目变化和对应 Progress 更新的 commit 完成该区间。
- 在 `implementing` 发现计划或目标需要重审的情况下，应该指示 Agent 保留已有工作并
  回到 `planning`，不得静默扩大 scope。
- 在实现已验证、发布并进入 remote primary 的情况下，应该指示 Agent 绑定该 primary
  commit、transition 到 `finalizing` 并重新查询。
- 在 `finalizing` 的情况下，应该指示 Agent 只修改当前 task folder，按 finalizing
  prompts 操作外部工具，并记录部署、smoke test、manual acceptance 等 receipt。
- 在 finalizing 发现任何 task folder 外 tracked change 或需要修改实现的情况下，应该
  指示 Agent 保留变化、先回到 `implementing`，再提交实现变化。
- 在 finalizing 发现目标或计划需要改变的情况下，应该指示 Agent 先回到 `planning`。
- 在 finalizing 等待 human input 或外部系统的情况下，应该指示 Agent 给出精确等待对象
  后 yield，不立即重新查询。
- 在所有 finalization 条件满足的情况下，应该指示 Agent 请求绑定 implementation target
  的最终确认，并在批准后 transition 到 `completed`。
- 在显式查询 `completed` 或 `abandoned` 任务的情况下，应该指示 Agent 询问用户是否调整
  目标；用户拒绝时停止，用户确认时修订契约并执行 reactivate。
- 在 instruction 完成且声明的输入变化已经发生的情况下，应该指示 Agent 重新调用
  `whatsnext`；在没有变化、等待或错误的情况下，应该指示 Agent 报告 no progress 并停止。

## Phase permissions and enforcement

Planning 和 finalizing 的可验证不变量是：

$$
publishedPaths \subseteq currentTaskFolder \cup repoledgerOwnedTransitionPaths
$$

这里的“项目变化”包括代码、测试、文档、配置、schema、workflow 和 tracked generated
files，而不只指编程语言源文件。Repoledger-owned exception 只允许合法 transition 对
`tasks/status.yaml` 中精确 record 的原子修改；普通 task commit 不得借此夹带 ledger 或
其他路径变化。

Implementing 不要求每个 commit 同时修改 task folder 内外。一个 implementation
checkpoint 可以包含多个中间 commit，但 checkpoint range 必须具有 task folder 外的实际
实现 delta，并以至少一个同时包含外部变化与对应 Progress 更新的 commit 收束。独立的
Progress-only commit 不得充当 checkpoint。Source publication、重新查询 `whatsnext` 和
`implementing -> finalizing` 前必须验证从上一个 checkpoint 到当前 tip 的完整区间。

共享 validator 是规则的唯一实现，支持 staged candidate、单 commit、commit range、
source publication 和 remote primary 检查。Repoledger lifecycle/publication 命令不得绕过
validator。可选 `pre-commit`/`pre-push` hook 只提供快速反馈，因为本地 hook 可缺失或通过
`--no-verify` 跳过；真正阻止违规内容进入 primary 依赖 required CI 和 branch protection。

一个 worktree 同时最多绑定一个可变任务。Planning、implementing 和 finalizing record
都保留 advertised source branch，执行 worktree 必须与它对应；绑定另一任务、分支不符或
存在无法归属 changes 时拒绝任务写入并建议独立 worktree。同一 repository 可以用多个
worktree 并行任务，其他任务的 list/status/check 等只读操作不受限制。该约束使 worktree
HEAD 与 changes 能无歧义地成为单个 task 的 guidance 输入，但不把本地 worktree 当作
跨 clone 的全局锁；远端并发继续由 source ref 和非强推 publication 检测。

## Out of scope

- 执行任意 shell hook、加载可执行插件，或把 Repoledger 建成通用 workflow engine、
  scheduler 或事件总线；phase prompt 只指导 Agent 使用其已有且获准的工具。
- 用 `whatsnext` 取代实现期间按需进行的源码调查、测试、调试或领域工具调用。
- 让项目 prompt 覆盖平台安全规则、工具权限、Repoledger 生命周期不变量或 human
  approval 要求。
- 根据沉默、Git 活动或 prompt 文本自动推断人工批准、任务完成或放弃决定。
- 为 pre-registration draft 引入没有 ledger task identity 的控制循环。
- 允许一个 worktree 同时承载多个任务的可变工作，或自动丢弃、搬运无法归属的 changes。
- 绕过受控系统直接实现 npm publish、部署等外部副作用；Agent 只按 finalizing prompt
  评估或安全触发，并记录不包含秘密的结果。
- 在本任务设计阶段预先固定 JSON disposition 名称；它们应从 lifecycle statements 和
  Agent loop 的实际控制需求推导。

## Acceptance criteria

- [ ] `repoledger.yaml` 可声明可选的 prompt extensions；未配置扩展的现有 version 2
  项目保持有效且行为不变。
- [ ] Extension id、kind、phase 和 prompt path 使用封闭且可验证的 contract；prompt
  必须是仓库内普通文件，拒绝绝对路径、父目录穿越、符号链接和越出仓库根目录的目标。
- [ ] Planning、implementing 和 finalizing 分别加载当前 phase 的 prompt；核心 Task
  contract、安全、权限和 human approval 规则不可被项目或全局 prompt 覆盖。
- [ ] Lifecycle 支持 backlog、planning、implementing、finalizing、completed、abandoned
  及本文 transition graph；active phase 保留 source ref，finalizing 绑定精确
  implementation commit，reactivation 保留历史并使用新的 generation/source identity。
- [ ] 旧 `ongoing` record 具有确定、可审计且不靠文本启发式猜测的兼容或迁移行为。
- [ ] `repoledger whatsnext [task]` 不修改任务、配置、Git refs、工作树或外部系统；默认
  刷新并读取 authoritative primary，必要时验证 active source ref。
- [ ] 未指定任务且无法唯一选择时返回结构化 `selection-required` 与候选任务，不静默
  猜测；指定未知、冲突或绑定到其他 worktree task 时返回可操作诊断。
- [ ] Observation 只使用本文六类输入并生成稳定 snapshot digest；相同 snapshot 的纯
  projection 产生相同 prompt，observation 期间输入变化会使候选结果失效。
- [ ] 一次 `whatsnext` 调用提供当前 macro-step 所需的 task contract、phase prompt、
  instruction、完成条件、预期输入变化、human/external yield 与 requery 条件，Agent 无需
  再逐个读取 lifecycle 工件或 prompt 文件。
- [ ] 每条 guidance rule 均可用“在 X 的情况下，应该指示 Agent 做 Y”表达并有表驱动
  测试；完成 prompt 后只能在输入已变化时重查，或在 human/external wait、错误与
  no-progress 时停止当轮。
- [ ] Planning 和 finalizing 的 staged、commit、range、source publication 与 remote
  check 均拒绝当前 task folder 外的 tracked changes，合法且精确的 Repoledger transition
  commit 除外。
- [ ] Implementing 允许 checkpoint 内的中间 code-only commits，但发布或 requery 前必须
  验证累计 external delta，并由同一 commit 中的实现变化与 Progress 更新形成 checkpoint；
  Progress-only commit 不满足该条件。
- [ ] Finalizing 可调用外部工具，但部署、smoke test、manual acceptance 和 follow-up
  结果必须形成 task-folder receipt；任何实现变化都要求先回到 implementing，目标变化
  要求先回到 planning。
- [ ] Completed/abandoned 不被默认选为活跃任务；显式查询会询问是否调整目标，否定时
  停止，肯定时经确认原子修订 Task、增加 generation 并 reactivate 到 backlog。
- [ ] 一个 worktree 最多绑定一个可变任务；同仓库多任务通过独立 worktree 并行，绑定
  冲突或无法归属 changes 不会被覆盖、混入或自动丢弃。
- [ ] Git hooks 与 lifecycle/publication 命令复用同一 validator；绕过本地 hook 的违规
  candidate 仍被 required CI 拒绝进入 protected primary。
- [ ] Repoledger skill 对 `exec`、`complete` 和 `abandon` 使用统一 loop contract，在
  可观察进展后才刷新，需要 human input 时提出精确问题并结束当前轮，并遵循 phase
  permissions、worktree 绑定和终态 reactivation 规则。
- [ ] `new` 仍只登记 backlog task 后停止；`status` 仍保持纯查询语义，不因引入 loop
  自动执行下一步。
- [ ] `Task.md`、`Progress.md`、`UserAcceptance.md` 和 `tasks/status.yaml` 继续是可审计
  source of truth；`whatsnext` 只做确定性 projection，不生成不存在的批准或实现事实。
- [ ] 自动化测试覆盖配置与路径校验、完整 transition graph、旧 ongoing 兼容、各 phase
  statements、snapshot 纯函数、stale snapshot、checkpoint range、路径权限、worktree
  冲突、human yield、finalization receipt、reactivation、文本/JSON 一致性和 skill loop。

## Constraints

- `whatsnext` 必须保持只读；状态转换、发布和外部副作用继续通过现有显式命令或受控
  工作流完成。
- CLI 负责权威状态解析与结构化导航，skill 负责调用工具、执行 step 和处理当轮 human
  input；任何一方都不得伪造另一方无法证明的事实。
- Prompt projection 的全部输入限于本文定义的规范 snapshot；外部事实只有形成 task
  receipt 或进入其他声明输入后，才能影响下一次输出。
- 项目 prompt 是 repository-owned guidance，不是可提升权限的指令层，也不得改变
  phase permissions、审批目标或合法 lifecycle transition。
- Lifecycle state、phase、prompt kind 和最终机器协议字段使用封闭枚举并保持向后兼容；
  叙述文本遵循 task 记录的语言，命令、标识符和机器协议标记保持英文。
- Instruction bundle 只携带完成当前 step 所需的上下文，避免每轮重复完整任务历史或
  提前加载未来阶段 prompt。
- Human yield 是正常暂停而非失败；没有新状态、外部证据或 human input 时不得立即重试
  同一个 step。
- Planning/finalizing 的 path restriction 和 implementing checkpoint 是 validator 强制的
  repository invariant，不只依赖 Agent 遵循 prompt 或本地 Git hook。
- Worktree binding 是本地执行归属，不是跨 clone 排他锁；共享协调仍以 canonical task
  record、advertised source ref 和非强推 publication 为准。
- 外部动作采用 observe-before-act 和幂等恢复；不可回滚的发布或部署不得与 ledger
  transition 假装成一个原子事务。
- Reactivation 不删除、重写或复用上一 generation 的 accepted history 和 source identity。
- 必须保留非强推发布、共享 source ref、精确 delivery-approved commit 和并发冲突检测
  等现有 Repoledger 保证。

## Human review checkpoints

Task creation records this plan, not approval.

| Checkpoint | Applicability | Reviewer | Planned review artifact | Approval required before |
| --- | --- | --- | --- | --- |
| Scope | Required | User or accountable owner | 本文的目标、范围、非目标、约束和验收标准。 | Substantive implementation. |
| Interface | Required | User or accountable owner | 本文 State machine design、Guidance statements、`repoledger.yaml` phase prompt contract、`repoledger whatsnext` 文本/JSON 协议、CLI transition 与 skill loop 行为。 | Implementing the affected interface. |
| Business and data model | Required | User or accountable owner | 六态 lifecycle、implementation target、generation/reactivation、finalization receipt、旧 ongoing migration 和 transition graph。 | Implementing the affected model. |
| Architecture | Required | User or accountable owner | Snapshot/pure projection、phase permissions、checkpoint validator、单 worktree 单任务绑定，以及 CLI、skill、Git hook、CI 和外部系统的职责边界。 | Implementing the affected module boundaries and control loop. |
| Delivery acceptance | Required | User or accountable owner | 已发布实现、完整验证结果、各 phase statement、路径拒绝、checkpoint、human yield、finalization 和 reactivation 的代表性演示。 | Running `task complete` for the exact approved primary commit. |

## References

- [Repoledger skill](../../skills/repoledger/SKILL.md)
- [Repository task profile](../../docs/repository-tasks.md)
- [CLI implementation](../../src/cli.js)
- [Task status projection](../../src/status.js)
- [Project configuration](../../src/config.js)
- [Version 2 schema](../../schema/v2.json)
- [npm package release workflow](../../docs/npm-package-releases.md)