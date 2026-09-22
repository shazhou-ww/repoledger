# 以 whatsnext 驱动 Agent 任务循环

Created: 2026-09-22
Language: zh-CN

## Goal

Repoledger 提供只读的 `repoledger whatsnext [task]` 接手接口，把权威任务状态、
当前所需任务上下文和项目可选的阶段 prompt 投影成一个完整且确定的下一步；
Repoledger skill 据此运行可暂停、可恢复的 Agent loop，直到任务完成、放弃或遇到
需要 human input 的 yield。

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
- 定义确定性的 step identity、snapshot、disposition、完成条件和刷新边界，使相同权威
  状态产生相同下一步，并禁止在没有新事实、human input 或外部证据时空转轮询。
- 支持 `act`、`yield`、`blocked` 和 `terminal` 等封闭 disposition；human decision
  必须绑定明确的 review artifact 或 commit，恢复后先确认目标未过期。
- 在项目配置中支持可选、具名、类型化且 phase 有限的 prompt extensions，只解析当前
  step 所需的 prompt；明确开始准备、交付准备、完成后 follow-up 和放弃准备等时机的
  适用边界。
- 为完成后的发布、部署等 follow-up 定义可恢复且避免重复副作用的判定和回执语义，
  区分 ledger terminal state 与 harness terminal disposition，并避免后续配置变化意外
  重新激活历史终态任务。
- 更新 Repoledger skill，使 `exec`、`complete` 和 `abandon` 复用同一个 whatsnext
  loop：执行当前 step、在产生新状态后重新查询、需要用户决定时 yield，并在 blocked
  或 terminal 时停止；保留 `new` 只登记 backlog 后停止的现有边界。
- 更新配置 schema、CLI 帮助、README、adoption/task workflow 文档和自动化测试，说明
  prompt 信任边界、loop 语义、恢复规则和兼容行为。

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
  disposition、稳定 step id、instruction、done condition、decision target、evidence 要求
  和 refresh boundary；人类可读输出表达相同事实。
- [ ] 相同权威状态与项目指导产生相同 step；step 或 snapshot 过期时明确要求刷新，且
  无新状态时不会指示 Agent重复执行有副作用的动作或无界调用 `whatsnext`。
- [ ] `yield` 明确描述等待的 human input、绑定的 artifact/commit 和恢复方式；调用本身
  不把 invocation、沉默或普通 Git 授权当作批准。
- [ ] 项目 prompt 只在匹配 phase 时进入 instruction bundle，来源固定为 authoritative
  primary，并明确低于平台规则、skill 不变量和结构化 step contract 的优先级。
- [ ] 交付前需要修改仓库的工作在 delivery preparation 中暴露；完成后的 npm release、
  deployment 等 follow-up 可以幂等检查、跨 yield 恢复并最终收敛到 terminal，而不会
  回滚或重开已完成任务。
- [ ] Prompt 配置修改、重命名或删除对已有终态任务的适用规则确定且有测试，不会无意
  重新激活全部历史 completed/abandoned 任务。
- [ ] Repoledger skill 对 `exec`、`complete` 和 `abandon` 使用统一 loop contract，在
  `act` 后有可观察进展才刷新，在 `yield` 时向用户提出精确问题并结束当前轮，在
  `blocked` 或 `terminal` 时停止。
- [ ] `new` 仍只登记 backlog task 后停止；`status` 仍保持纯查询语义，不因引入 loop
  自动执行下一步。
- [ ] `Task.md`、`Progress.md`、`UserAcceptance.md` 和 `tasks/status.yaml` 继续是可审计
  source of truth；`whatsnext` 只做确定性 projection，不生成不存在的批准或实现事实。
- [ ] 自动化测试覆盖无扩展兼容性、配置与路径校验、各 lifecycle/disposition 分支、
  human yield、stale snapshot、source divergence、post-completion follow-up、终态收敛、
  文本/JSON 一致性以及 skill loop 指令。

## Constraints

- `whatsnext` 必须保持只读；状态转换、发布和外部副作用继续通过现有显式命令或受控
  工作流完成。
- CLI 负责权威状态解析与结构化导航，skill 负责调用工具、执行 step 和处理当轮 human
  input；任何一方都不得伪造另一方无法证明的事实。
- 项目 prompt 是 repository-owned guidance，不是可提升权限的指令层，也不得改变
  disposition、审批目标或合法生命周期转换。
- Phase、kind、disposition 和机器协议字段使用封闭枚举并保持向后兼容；叙述文本遵循
  task 记录的语言，命令、标识符和机器协议标记保持英文。
- Instruction bundle 只携带完成当前 step 所需的上下文，避免每轮重复完整任务历史或
  提前加载未来阶段 prompt。
- Human yield 是正常暂停而非失败；没有新状态、外部证据或 human input 时不得立即重试
  同一个 step。
- 外部动作采用 observe-before-act 和幂等恢复；不可回滚的发布或部署不得与 ledger
  transition 假装成一个原子事务。
- 必须保留非强推发布、共享 source ref、精确 delivery-approved commit 和并发冲突检测
  等现有 Repoledger 保证。

## Human review checkpoints

Task creation records this plan, not approval.

| Checkpoint | Applicability | Reviewer | Planned review artifact | Approval required before |
| --- | --- | --- | --- | --- |
| Scope | Required | User or accountable owner | 本文的目标、范围、非目标、约束和验收标准。 | Substantive implementation. |
| Interface | Required | User or accountable owner | `repoledger.yaml` prompt contract、`repoledger whatsnext` 文本/JSON 协议、disposition、CLI 帮助与 skill loop 行为。 | Implementing the affected interface. |
| Business and data model | Required | User or accountable owner | Phase/step 状态模型、terminal 与 follow-up 回执语义、历史终态任务适用规则及兼容策略。 | Implementing the affected model or persisted follow-up state. |
| Architecture | Required | User or accountable owner | CLI 状态投影、prompt resolver、ledger/source ref 读取、skill harness 与外部副作用系统之间的职责边界。 | Implementing the affected module boundaries and control loop. |
| Delivery acceptance | Required | User or accountable owner | 已发布实现、完整验证结果、代表性 act/yield/blocked/terminal 演示及兼容性证据。 | Running `task complete` for the exact approved primary commit. |

## References

- [Repoledger skill](../../skills/repoledger/SKILL.md)
- [Repository task profile](../../docs/repository-tasks.md)
- [CLI implementation](../../src/cli.js)
- [Task status projection](../../src/status.js)
- [Project configuration](../../src/config.js)
- [Version 2 schema](../../schema/v2.json)
- [npm package release workflow](../../docs/npm-package-releases.md)