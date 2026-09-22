# 以 whatsnext 驱动 Agent 任务循环

Created: 2026-09-22
Language: zh-CN

## Goal

Repoledger 提供只读的 `repoledger whatsnext [task]` 接手接口，把权威任务状态、
当前所需任务上下文和项目可选的阶段 prompt 投影成一个完整且确定的下一步；
Repoledger skill 据此运行可暂停、可恢复的 Agent loop，直到单条任务记录映射到终止
disposition；Agent 在执行当前 instruction 时仍可为 human input 暂停和恢复。

## Context

当前 skill 在每次接手任务时分别调用 task list、status 和 remote check，并读取
`Task.md`、`Progress.md`、`UserAcceptance.md` 等文件后自行解释下一步。这增加工具
往返、token 消耗和 latency，也让不同 Agent 对生命周期规则的执行容易漂移。

项目还可能在开始、交付准备或任务完成后需要不同的上下文和 follow-up，例如判断
是否应发布 npm package、触发线上部署或更新外部 issue。把这些需求实现为任意命令
hook 会混淆只读指导与外部副作用，也难以定义重试、审批和幂等语义。Repoledger
需要一个受限的项目 prompt 扩展模型，并由统一的下一步接口在恰当阶段按需注入。

## Scope

- 增加无子命令的只读 `repoledger whatsnext [task]` 接口，提供面向 Agent 的文本输出
  和稳定 JSON 协议，并默认基于刷新后的 authoritative primary 与 ongoing source ref。
- 将任务状态、任务语言、稳定任务工件、review gate、manual acceptance、source ref、
  validation/blocker 以及当前适用的项目 prompt 解析为一个可执行 step，而不是要求
  Agent 分别读取和拼接生命周期上下文。
- 定义最小且封闭的 disposition 集：`backlog -> unstarted`、`ongoing -> active`、
  `completed | abandoned -> terminal`；missing、unregistered 和 selection-required 是命令
  诊断或选择结果，不是 disposition。
- 使 disposition 严格成为 `tasks/status.yaml` 中单条 task record 的纯函数；Task、
  Progress、prompt、human input、外部状态和 source ref 检查可以影响 instruction 与
  evidence，但不得暗中改变 disposition。
- 定义确定性的 step identity、snapshot、完成条件和刷新边界；human decision 必须绑定
  明确的 review artifact 或 commit，恢复后先确认目标未过期。
- 在项目配置中支持可选、具名、类型化且 phase 有限的 prompt extensions，只解析当前
  record state 所需的 prompt；首版 phase 只对应 `backlog`、`ongoing`、`completed` 和
  `abandoned`，不从任务工件或对话猜测未持久化的执行子阶段。
- 把完成后的发布、部署等 follow-up 作为 terminal advisory，在核心 task loop 外按
  observe-before-act 处理；首版不为 advisory 增加 receipt，也不让它改变 terminal
  disposition，需要跨会话持久协调的后续工作由外部系统或独立任务承载。
- 更新 Repoledger skill，使 `exec`、`complete` 和 `abandon` 复用同一个 whatsnext
  loop：执行当前 step、在产生新状态后重新查询、需要用户决定时 yield，并按最终确定
  的 disposition contract 继续或停止；保留 `new` 只登记 backlog 后停止的现有边界。
- 更新配置 schema、CLI 帮助、README、adoption/task workflow 文档和自动化测试，说明
  prompt 信任边界、loop 语义、恢复规则和兼容行为。

## State machine design

Disposition 的定义域是 `tasks/status.yaml` 中已经注册任务的单条 canonical record，且
映射只读取 `state`：

| Record state | Disposition | Legal ledger transitions | Source ref | Core loop meaning |
| --- | --- | --- | --- | --- |
| `backlog` | `unstarted` | `start -> ongoing`、`abandon -> abandoned` | Forbidden | 任务尚未建立共享执行分支；route intent 决定 start 或请求 abandon decision。 |
| `ongoing` | `active` | `complete -> completed`、`abandon -> abandoned` | Required | 任务可恢复；Agent 继续当前 route，直到产生 transition、human yield 或实际 blocker。 |
| `completed` | `terminal` | None | Forbidden | 核心任务成功终止；可呈现 terminal advisory，但不得重新激活任务。 |
| `abandoned` | `terminal` | None | Forbidden | 核心任务放弃终止；可呈现 terminal advisory，但不得重新激活任务。 |

`absent -> backlog` registration 不属于已注册 record 的 disposition transition。
Primary 中存在任务目录但没有 status record 时得到的 `unregistered` 也是 layout 投影，
不是合法 task record；`whatsnext` 对 missing、unregistered、选择歧义和无效 record 返回
结构化诊断或 selection result，不伪造 disposition。

Disposition 只回答核心 loop 是否尚未开始、正在进行或已经终止，不选择具体命令，也不
表示 transition 已获授权。`exec`、`complete` 和 `abandon` 是 skill 持有的 route intent：
同一个 `backlog` record 在 `exec` 下可以 start，在 `abandon` 下必须先取得明确决定；
同一个 `ongoing` record 可以恢复实现、在满足 gate 后 complete，或在明确决定后 abandon。
因此 route intent、approval readiness 和合法 transition capabilities 分别输出，不能塞进
disposition。

`whatsnext` 的 instruction projection 可以读取 authoritative Task/Progress/
UserAcceptance、source tip、primary commit、项目 prompt 和外部只读证据。它们共同形成
snapshot、instruction、required input、evidence 和 refresh boundary，但不改变
disposition。Step identity 绑定完整 resolved snapshot；record 未变化而 source tip、任务
工件或 prompt bundle 变化时，step 可以变化，disposition 必须不变。

Human wait、环境故障和实现 blocker 是 Agent 执行当前 instruction 后的 outcome，不是
ledger disposition。Agent 可以向用户提出精确问题并 yield，或报告 blocker 后停止当轮；
恢复时重新取得最新 snapshot，并继续服从同一 record-derived disposition。只有合法 task
record transition 可以改变 disposition。

首版 prompt extension phase 与四个持久 record state 一一对应。`ongoing` prompt 必须一次
提供实现、交付准备和 gate 相关的完整项目指导，因为现有 record 无法区分这些子阶段。
`completed` 和 `abandoned` prompt 是 terminal advisory：允许检查 npm release、部署或
通知是否适用，但必须幂等，重复读取不得重复副作用。项目配置变化可以改变以后显式查询
看到的 advisory 文本，但不能改变历史 record 的 terminal disposition，也不会让默认
`exec` 重新选择终态任务。Exactly-once receipt、持久 post-completion queue 或更细执行
phase 若成为需求，必须通过独立评审显式扩展 task record 和 transition graph。

## Out of scope

- 执行任意 shell hook、加载可执行插件，或把 Repoledger 建成通用 workflow engine、
  scheduler 或事件总线。
- 用 `whatsnext` 取代实现期间按需进行的源码调查、测试、调试或领域工具调用。
- 让项目 prompt 覆盖平台安全规则、工具权限、Repoledger 生命周期不变量或 human
  approval 要求。
- 根据沉默、Git 活动或 prompt 文本自动推断人工批准、任务完成或放弃决定。
- 为 pre-registration draft 引入没有 ledger task identity 的控制循环。
- 自动执行 npm publish、部署或其他外部副作用；这些动作继续由受控且可审计的系统
  实现，Agent 只按当前 step 评估或安全触发。

## Acceptance criteria

- [ ] `repoledger.yaml` 可声明可选的 prompt extensions；未配置扩展的现有 version 2
  项目保持有效且行为不变。
- [ ] Extension id、kind、phase 和 prompt path 使用封闭且可验证的 contract；prompt
  必须是仓库内普通文件，拒绝绝对路径、父目录穿越、符号链接和越出仓库根目录的目标。
- [ ] `repoledger whatsnext [task]` 不修改任务、配置、Git refs、工作树或外部系统；默认
  刷新并读取 authoritative primary，必要时验证 ongoing source ref。
- [ ] 未指定任务且无法唯一选择时返回结构化 `selection-required` 与候选任务，不静默
  猜测；指定未知或冲突任务时返回可操作诊断。
- [ ] 一次 `whatsnext` 调用可提供当前 step 所需的任务 contract、最新持久进展、gate、
  blocker、语言和项目指导，Agent 无需再次读取生命周期工件或逐个 prompt 文件。
- [ ] JSON 输出包含版本化协议、task/language、primary/source snapshot、lifecycle、
  disposition、合法 transition capabilities、route intent、稳定 step id、instruction、
  done condition、decision target、evidence 要求和 refresh boundary；人类可读输出表达
  相同事实。
- [ ] 完整映射固定为 `backlog -> unstarted`、`ongoing -> active`、
  `completed | abandoned -> terminal`；missing、unregistered、selection-required 和
  invalid record 均不会产生 disposition。
- [ ] 对任何已注册任务，只有其单条 task record 改变时 disposition 才可能改变；任务
  工件、项目 prompt、外部状态或同一轮 human input 的变化不得改变该纯函数结果。
- [ ] 相同 task record 产生相同 disposition；相同完整 resolved snapshot 产生相同 step
  identity。Step 或 snapshot 过期时明确要求刷新，且无新证据时不会指示 Agent 重复
  副作用或无界调用 `whatsnext`。
- [ ] 需要 human input 的 instruction 明确描述等待内容、绑定的 artifact/commit 和恢复
  方式；Agent 可以 yield，但调用本身不把 yield、沉默或普通 Git 授权当作 ledger 状态
  或批准。
- [ ] 项目 prompt 只在匹配 phase 时进入 instruction bundle，来源固定为 authoritative
  primary，并明确低于平台规则、skill 不变量和结构化 step contract 的优先级。
- [ ] 首版 prompt phase 只对应四个 record state；Task、Progress、对话或启发式判断不会
  产生 delivery-preparation、waiting-human 等隐藏 phase。
- [ ] 交付前需要修改仓库的工作在 delivery preparation 中暴露；完成后的 npm release、
  deployment 等 terminal advisory 可以幂等检查、跨 human yield 恢复，且不会回滚或
  重开已完成任务；首版不承诺 exactly-once receipt。
- [ ] Completed/abandoned 的 disposition 不依赖 follow-up、receipt 或当前项目配置；
  需要持久 pending/satisfied/applicability 状态时，必须另行评审 task record 扩展，不能
  写入旁路 ledger 后仍声称 disposition 是单条 record 的纯函数。
- [ ] Prompt 配置修改、重命名或删除对已有终态任务的适用规则确定且有测试，不会无意
  重新激活全部历史 completed/abandoned 任务。
- [ ] Repoledger skill 对 `exec`、`complete` 和 `abandon` 使用统一 loop contract，在
  可观察进展后才刷新，需要 human input 时提出精确问题并结束当前轮，并严格按最终
  disposition 映射决定继续或停止。
- [ ] `new` 仍只登记 backlog task 后停止；`status` 仍保持纯查询语义，不因引入 loop
  自动执行下一步。
- [ ] `Task.md`、`Progress.md`、`UserAcceptance.md` 和 `tasks/status.yaml` 继续是可审计
  source of truth；`whatsnext` 只做确定性 projection，不生成不存在的批准或实现事实。
- [ ] 自动化测试覆盖无扩展兼容性、配置与路径校验、完整 record/disposition 映射、
  disposition 纯函数约束、human yield、stale snapshot、source divergence、
  post-completion follow-up、终态收敛、文本/JSON 一致性以及 skill loop 指令。

## Constraints

- `whatsnext` 必须保持只读；状态转换、发布和外部副作用继续通过现有显式命令或受控
  工作流完成。
- CLI 负责权威状态解析与结构化导航，skill 负责调用工具、执行 step 和处理当轮 human
  input；任何一方都不得伪造另一方无法证明的事实。
- Disposition 的唯一输入是 `tasks/status.yaml` 中该任务的单条 record；从 Task、Progress、
  prompt、Git reachability 或外部系统读取的事实只能进入 instruction、evidence 或诊断。
- `unstarted`、`active` 和 `terminal` 描述 record 的核心 loop control，不是命令、Agent
  outcome、审批状态或工作是否就绪的同义词。
- 项目 prompt 是 repository-owned guidance，不是可提升权限的指令层，也不得改变
  disposition、审批目标或合法生命周期转换。
- Phase、kind、执行时确定的 disposition 和机器协议字段使用封闭枚举并保持向后兼容；
  叙述文本遵循 task 记录的语言，命令、标识符和机器协议标记保持英文。
- Instruction bundle 只携带完成当前 step 所需的上下文，避免每轮重复完整任务历史或
  提前加载未来阶段 prompt。
- Human yield 是正常暂停而非失败；没有新状态、外部证据或 human input 时不得立即重试
  同一个 step。
- Terminal advisory 不拥有持久 receipt；必须可安全重复评估，任何需要 exactly-once 或
  长期追踪的动作都留给外部 workflow 或独立 Repoledger task。
- 外部动作采用 observe-before-act 和幂等恢复；不可回滚的发布或部署不得与 ledger
  transition 假装成一个原子事务。
- 必须保留非强推发布、共享 source ref、精确 delivery-approved commit 和并发冲突检测
  等现有 Repoledger 保证。

## Human review checkpoints

Task creation records this plan, not approval.

| Checkpoint | Applicability | Reviewer | Planned review artifact | Approval required before |
| --- | --- | --- | --- | --- |
| Scope | Required | User or accountable owner | 本文的目标、范围、非目标、约束和验收标准。 | Substantive implementation. |
| Interface | Required | User or accountable owner | 本文 State machine design、`repoledger.yaml` prompt contract、`repoledger whatsnext` 文本/JSON 协议、CLI 帮助与 skill loop 行为。 | Implementing the affected interface. |
| Business and data model | Required | User or accountable owner | 本文的三态 disposition 映射、route/outcome 分层、terminal advisory 非持久语义、历史终态任务适用规则及兼容策略。 | Implementing the affected model. |
| Architecture | Required | User or accountable owner | 本文的 record/instruction/Agent outcome 分层，以及 CLI 状态投影、prompt resolver、skill harness 与外部副作用系统之间的职责边界。 | Implementing the affected module boundaries and control loop. |
| Delivery acceptance | Required | User or accountable owner | 已发布实现、完整验证结果、最终 disposition 映射、human yield 演示及兼容性证据。 | Running `task complete` for the exact approved primary commit. |

## References

- [Repoledger skill](../../skills/repoledger/SKILL.md)
- [Repository task profile](../../docs/repository-tasks.md)
- [CLI implementation](../../src/cli.js)
- [Task status projection](../../src/status.js)
- [Project configuration](../../src/config.js)
- [Version 2 schema](../../schema/v2.json)
- [npm package release workflow](../../docs/npm-package-releases.md)