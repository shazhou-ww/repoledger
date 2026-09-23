# 以 whatsnext 驱动 Agent 任务循环

Created: 2026-09-22
Language: zh-CN

## Goal

Repoledger 提供只读的 `repoledger whatsnext [task]` 接手接口，观察 task lifecycle/phase、
task artifacts、Git/worktree、项目与全局配置以及 remote refs，并以纯函数生成一段 Agent
可执行的下一步提示。Agent 执行提示后推动可观察输入发生变化并重新查询，或在等待
human/external input、可操作错误及 no-progress 边界安全停止。

## Context

当前 skill 在接手任务时分别运行 task list、status 和 remote check，再读取多个 artifact
自行解释下一步，增加工具往返、token 消耗和不同 Agent 之间的行为漂移。现有 `ongoing`
还同时覆盖 planning、implementing 与 finalizing，无法直接决定当前允许的副作用和应加载
的项目 prompt。

此前设计又过早把 guidance output、transition edge 和软件工程领域的 review/test/deploy
概念塞进 `State.yaml`。正确的 Moore machine 模型中，完整状态由 ledger、phase、artifacts、
Git、配置和 remote 等多个分量组成；guidance 是输出，transition 是边。应先完整推导每个
状态下“观察到 X，应指示 Agent 做 Y”，再反推哪些无法重建的事实需要最小持久状态。

项目与本任务语言均为 `zh-CN`，但此前 Design.md 使用英文，说明 task language 虽已正确
解析并记录，Agent 对普通 task narrative artifact 的执行范围与测试覆盖仍不完整。

当前提示逻辑、状态图与待推导问题以 [提示逻辑设计](./Design.md) 为规范评审 artifact。

## Scope

- 定义完整观察状态，包括 selected task 的 primary coarse lifecycle、ongoing phase、task
  artifacts/history、worktree/index/HEAD、项目/全局配置及刷新后的 source/primary refs。
- 明确 `repoledger whatsnext` 是独立命令：task selection 在 observation 前完成；外层
  `/repoledger exec|complete|abandon`、当前 conversation request 和 selection 过程都不进入
  prompt 计算，相同 selected task snapshot 必须产生相同 guidance。
- 明确 `guidance = render(observedState)`；human/external/tool event 触发 transition，guidance
  与 transition 均不作为当前状态字段持久化。
- 保持 primary lifecycle 为 `backlog | ongoing | completed | abandoned`，并把
  `planning | implementing | finalizing` 作为 ongoing 的内部 phase。
- 使用 Mermaid 状态图表达 lifecycle/phase 关系，不再使用难以阅读的 ASCII 状态图。
- 为 backlog、ongoing/planning、ongoing/implementing、ongoing/finalizing、completed 与
  abandoned 分别列出领域无关的文字提示规则，统一采用“观察到 X，应做 Y”的形式。
- 定义跨状态的确定性输出优先级：selection/protocol、conflict/worktree safety、ref sync、
  lifecycle/phase、项目 prompts、yield/requery/no-progress。
- 把 staged/unstaged/untracked/conflict、worktree binding 和 local/source/primary ancestry
  纳入 observation，并为 clean fast-forward、dirty-behind、ahead 与 diverged 给出安全提示。
- 要求 Agent 精确读取 dirty diff：保留并提交合法的必要 task work；只删除当前操作创建或
  repository policy 可确定识别的临时产物；未知、用户已有或无关变更默认保留和隔离。
- 允许项目按 phase 配置可选 prompts，以承载文档、软件、内容创作、发布等领域语义；
  Repoledger core 不预设 UX、架构、criterion、test、deploy 或 smoke 等分类。
- 明确没有配置 phase prompt 时仍可使用 core guidance，不把任何软件工程工作流当作必选项。
- 在提示逻辑获得评审后，逐条判断条件能否从 Git/artifacts/config/remote 重建，再设计最小
  持久 state detail；当前不固定 `State.yaml` schema、decision/receipt 字段或 event 格式。
- 后续实现 phase-base 与累计 range checking 时，检查当前 phase 初始边界到 candidate 的
  完整变更，而不是只看最近 commit；具体持久 marker 方案须由提示逻辑所需信息反推并评审。
- 更新 Repoledger skill，使现有 task 的所有 Agent-authored narrative artifacts 都使用
  `Task.md` 已记录语言，而不只覆盖 Task、Progress、UserAcceptance 或面向用户回复。
- 更新 CLI、schema、checker、skill、README、adoption/task workflow 文档和自动化测试，
  覆盖最终获批的状态输入、提示输出、循环与协作安全语义。

## Out of scope

- 在提示逻辑评审前固定 `State.yaml` 的具体字段、guidance item、transition、closure、
  reviewer、criterion、validation 或 receipt schema。
- 把 guidance 文本、next action 或 transition edge 本身当作当前状态分量持久化。
- 执行任意 shell hook、加载可执行插件，或把 Repoledger 建成通用 workflow engine、
  scheduler 或事件总线。
- 用 `whatsnext` 取代实现期间按需进行的 repository 调查、验证或领域工具调用。
- 让项目 prompt 覆盖平台安全规则、工具权限、Repoledger lifecycle/phase、审批与发布不变量。
- 从 Task/Progress 自由文本、沉默、普通 Git 活动、外层 skill verb 或 conversation intent
  猜测 human decision。
- 自动删除、reset、clean、checkout、覆盖或静默 stash 未知来源及用户已有 changes。
- 用自然语言检测器判断任意文档是否“足够中文”；语言一致性通过 recorded language、skill
  指令、模板和代表性测试约束。
- Force-push、rebase、squash 或删除 shared source history 来简化状态推导。

## Acceptance criteria

- [ ] [提示逻辑设计](./Design.md) 的叙述文本使用 `zh-CN`，命令、标识符、协议值与原样
  工具输出保持其技术形式；Task/Progress/UserAcceptance 之外的 task narrative artifact
  也被 skill 与测试明确纳入任务语言规则。
- [ ] Lifecycle/phase 使用 Mermaid 图表达，并包含 backlog、ongoing/planning、
  ongoing/implementing、ongoing/finalizing、completed、abandoned 与 reactivation。
- [ ] 完整 observed state 明确覆盖 selected task 的 coarse ledger、phase、task
  artifacts/history、worktree/Git、project/global config、remote source/primary；不把单个
  `State.yaml` 当成全状态。
- [ ] Command adapter 在 observation 前完成 task selection 或返回诊断；`render` 不接收
  `/repoledger` verb、用户当前请求或 selection provenance，同一 snapshot 不因调用来源改变。
- [ ] Guidance 明确是当前 observed state 的纯输出，transition 明确是 event 驱动的边；两者
  不会被设计成 `State.yaml` 字段。
- [ ] 每个 lifecycle/phase 都有完整、领域无关且可审计的“观察到 X，应做 Y”规则，包含
  进入、继续、human decision、返回前一 phase、abandon、completion 与 reactivation。
- [ ] Selection diagnostics 与 observation/render 明确分层；通用规则覆盖 invalid
  configuration/artifact、remote fetch failure、snapshot staleness、worktree binding、
  conflict、yield、requery 与 no-progress。
- [ ] Dirty changes 规则区分必要 task work、来源明确的临时产物、未知/用户已有工作、
  phase-illegal task work 与 conflicts；未知/无关现有工作默认保留并使用独立 worktree 或
  明确路径决定处理。
- [ ] Local/source/primary 关系覆盖 equal、behind、ahead、diverged 与 unavailable；只有 clean、
  matching 且 proven fast-forward 的显式 sync step 可自动执行 `ff-only`，其他情况不丢历史。
- [ ] Planning/finalizing 不允许直接提交 repository deliverable 变化；implementing 允许合法
  deliverable 变化；路径规则与累计 range checking 的最终设计须与提示逻辑一致。
- [ ] 项目 phase prompts 完全可选且领域无关；文档项目不被要求提供 test/deploy，软件项目
  也不由 core 自动获得固定 UX/架构/release checklist。
- [ ] 进入下一 phase 或 terminal 所需的 human/external 事实先在提示逻辑中明确；只有不能
  从既有状态分量重建且必须跨 session 保留的事实，才进入后续最小 state-detail 设计。
- [ ] 后续 state-detail 评审能把每个拟新增字段追溯到至少一条已批准提示条件，并证明不存
  guidance output、transition edge 或 Git 可推导 cache。
- [ ] `whatsnext` 保持只读，可 fetch/observe 但不 checkout、merge、commit、stash、delete、
  reset 或 fast-forward；副作用由输出的显式 step 和相应命令执行。
- [ ] Agent loop 只在 expected delta 或未声明输入变化后重新观察；human/external wait 结束
  当前 turn，无变化且无等待/错误时报告 no-progress，避免空转。
- [ ] 最终实现与自动化测试覆盖获批的提示矩阵、状态输入、sync/dirty 安全、task language、
  backward compatibility、pack、installed-package smoke 与 skill validation。

## Constraints

- 本轮 planning 只收敛提示逻辑；未经后续 Interface、Business/data model 和 Architecture
  review，不开始实现或固化 State schema。
- `whatsnext` 输出必须由当前 observation 决定，不读取未声明的 session memory 或猜测外部事实。
- Project prompts 提供领域工作，Repoledger core 只提供 lifecycle、phase、Git、安全与协作
  边界。
- Human reply、外部系统结果和 Agent 执行中的语义发现是 transition input；只有后续证明
  必须跨 session 保留时，才设计对应持久分量。
- Human reply 由 harness 在 guidance 输出后处理；造成可观察 delta 时才重新调用
  `whatsnext`，否则结束当前 turn。它不作为同一次 prompt 计算的隐藏输入。
- Worktree/remote reconciliation 先于 phase work；高优先级 blocker 未处理前不输出低优先级
  commit、transition 或外部副作用。
- 同任务并发依靠 refreshed refs、expected-tip CAS 与非强推 publication；不同任务通过独立
  worktree 隔离。
- 不得回退、覆盖或重写其他人的 primary/source work；恢复只追加合法历史或重发既有 tip。

## Human review checkpoints

Task creation records this plan, not approval.

| Checkpoint | Applicability | Reviewer | Planned review artifact | Approval required before |
| --- | --- | --- | --- | --- |
| Scope | Required | User or accountable owner | 本文的 Goal、Context、Scope、Out of scope、Acceptance criteria 与 Constraints。 | Substantive implementation. |
| Interface | Required | User or accountable owner | [提示逻辑设计](./Design.md) 的完整输入、六状态提示矩阵、输出优先级、项目 prompt contract 与 task language 范围。 | Designing concrete command/JSON/State interfaces. |
| Business and data model | Required | User or accountable owner | 获批提示逻辑反推的最小持久事实、coarse lifecycle/phase 关系和 reactivation 语义。 | Adding or implementing State/status fields. |
| Architecture | Required | User or accountable owner | `route/observe/render/advance` 边界、Git/worktree/remote observation、累计 range 与 sync/enforcement 职责。 | Implementing the control loop and repository mutations. |
| Delivery acceptance | Required | User or accountable owner | 已发布实现、完整验证结果及各状态、dirty/sync、human yield、no-progress 和 reactivation 的代表性演示。 | Running `task complete` for the exact approved primary commit. |

## References

- [Guidance design](./Design.md)
- [Repoledger skill](../../skills/repoledger/SKILL.md)
- [Repository task profile](../../docs/repository-tasks.md)
- [CLI implementation](../../src/cli.js)
- [Repository checker](../../src/index.js)
- [Git primitives](../../src/git.js)
- [Task publication](../../src/publication.js)
- [Task ledger](../../src/ledger.js)
- [Version 2 schema](../../schema/v2.json)