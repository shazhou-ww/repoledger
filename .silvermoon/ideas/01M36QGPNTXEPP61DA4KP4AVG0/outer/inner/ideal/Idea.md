# 建立 Agent Session Trajectory 评估基线

Created: 2026-09-22
Language: zh-CN

## Goal

Repoledger 提供一套可重复、可隔离且可扩展的 Agent session eval harness，
在 skill、Agent 可见 CLI contract 或生命周期 gate 变化后运行真实 coding-agent
会话，并以确定性的 trajectory 约束和最终仓库状态捕获普通自动化测试无法发现的
行为回归。

## Context

当前 `pnpm check` 可以验证 CLI 行为、schema、打包、安装后 smoke test 和 skill
结构，但 skill 测试主要检查静态文本、链接和 discovery，无法证明 Agent 在真实会话
中选择了正确 route、按正确顺序调用命令、等待必要的人类决定并在边界处停止。

Repoledger 的工作流包含只读查询、远端状态刷新、显式审批、共享 Git ref、暂停与恢复
等跨轮行为。精确 transcript 对比会把合理的模型差异误判成回归，只检查最终回复又会
漏掉越权写入、错误顺序和侥幸成功。项目需要复用现成开源 Agent eval 能力，并用
Repoledger 自己的 verifier 检查工具轨迹和真实状态变化。

## Scope

- 评估并采用能够运行真实 coding-agent session、输出结构化 trajectory 且支持隔离
  环境的开源 harness；优先验证 Harbor 的 Copilot CLI、ATIF 和 resume 能力，保留
  经 Architecture review 批准的等价替代方案。
- 定义版本化 scenario contract，描述输入 prompt、fixture、Agent/runtime、必须与禁止
  的动作、顺序约束、最终状态、重复次数、超时和 hard/soft 判定。
- 在一次性工作区中安装当前 checkout 生成的 Repoledger package 和待测 skill，并使用
  隔离的用户配置、Git 配置和 disposable remote，避免读取或修改真实项目远端与用户
  偏好。
- 记录可审计的 session metadata 和标准化 trajectory，包括源码 commit、skill/package
  hash、Agent host、模型、工具版本、可见消息、工具调用、结果与最终状态；不要求或
  保存隐藏 chain-of-thought。
- 实现确定性 verifier，优先检查 required/forbidden action、部分有序关系、审批边界、
  文件与 Git ref 差异、Repoledger lifecycle 状态以及退出条件；LLM judge 只用于语义
  和效率等 soft signal。
- 建立首批回归场景，覆盖普通实现请求不创建 task、`new` 登记后停止、未知 verb 零
  写入、`status` 只读、`complete` 不把 invocation 当作批准以及 `abandon` 等待明确
  决定。
- 提供聚焦场景和完整场景集的开发命令、失败报告、重复运行与本地调试流程，并说明
  缺少 Agent 授权、模型或容器运行时等前置条件时的可操作诊断。
- 为 skill route、审批 gate、停止条件、Agent 消费的 CLI 参数/输出和任务模板变化定义
  focused session eval 触发矩阵；保留确定性测试先行、发布前运行完整场景集的顺序。
- 更新开发文档和仓库 Agent 指令，使后续实现 Agent 能主动选择相关场景、记录验证
  结果，并把真实会话中发现的问题沉淀为 regression scenario。

## Out of scope

- 实现或改变 `repoledger whatsnext`、任务生命周期、审批规则或其他生产功能；这些属于
  各自的功能任务，本任务只提供可复用的评估基础设施和场景。
- 自动操纵已经打开的 VS Code Copilot Chat UI，依赖 VS Code 私有 debug-log 格式，
  或宣称 Copilot CLI 会话与 VS Code host 行为完全等价。
- 用 session eval 取代单元测试、集成测试、package smoke test、skill discovery 检查或
  人类 scope/interface/delivery review。
- 对完整 transcript、自然语言措辞或精确工具调用次数建立脆弱的 golden snapshot；
  除非某一步本身就是受保护 contract，否则允许行为等价的路径。
- 首版建设生产级 observability 平台、长期 trace 数据仓库、排行榜、模型训练或通用
  benchmark 服务。
- 在 eval 中使用生产凭据、真实客户数据、真实发布目标或不可恢复的外部副作用。

## Constraints

- 优先使用宽松开源许可证的现成 runner、trajectory format 和 scorer；引入依赖前记录
  许可证、维护状态、锁定方式和供应链影响。
- Hard gate 必须由确定性代码和可观察状态判定；LLM-as-judge 不得单独批准 destructive
  action、human approval、只读保证或 lifecycle transition。
- Session runner、fixture builder、trajectory normalizer 和 Repoledger verifier 的职责
  分离，避免把某个 Agent host 的私有事件格式扩散到 scenario contract。
- Fixture 使用 canonical HTTPS repository identity 时，只能通过隔离的 Git URL rewrite
  映射到 disposable remote；不得降低生产代码对 repository URL 的安全校验。
- Eval 产生的日志和 artifact 必须限制大小、清理敏感环境变量并默认留在 ignored 或 CI
  artifact 空间；不得把凭据、用户目录、客户数据或完整私有会话提交到仓库。
- 模型和 Agent host 具有非确定性；hard invariant 必须每次成立，效率、措辞和额外只读
  调查作为 soft signal 聚合，不通过无限重试掩盖含糊指令。
- VS Code Copilot Chat 与 Copilot CLI 的 host 差异必须明确保留；CLI 自动化结果不能替代
  发布前对真实 VS Code skill discovery、工具面和用户交互 gate 的代表性 smoke test。

## Human review checkpoints

Idea creation records this plan, not approval.

| Checkpoint | Applicability | Reviewer | Planned review artifact | Approval required before |
| --- | --- | --- | --- | --- |
| Scope | Required | User or accountable owner | 本文的目标、范围、非目标、约束和验收标准。 | Substantive implementation. |
| Interface | Required | User or accountable owner | Scenario contract、开发命令、报告格式、触发矩阵和 Agent 指令。 | Implementing the affected interface. |
| Business and data model | Required | User or accountable owner | Scenario/trajectory artifact schema、hard/soft outcome、重复运行聚合与保留规则。 | Implementing the affected model or persisted eval artifacts. |
| Architecture | Required | User or accountable owner | Runner 选型、Copilot CLI adapter、隔离 fixture、trajectory normalizer、verifier 与 VS Code smoke 的边界。 | Adding the selected dependencies and implementing module boundaries. |
| Delivery acceptance | Required | User or accountable owner | 已发布 harness、代表性真实 session、故障注入结果、完整验证和使用文档。 | Accepting deployment for the exact candidate. |

## References

- [Silvermoon skill](../../../../../../skills/silvermoon/SKILL.md)
- [Development validation scripts](../../../../../../package.json)
- [Harbor](https://github.com/harbor-framework/harbor)
- [Promptfoo coding-agent evaluations](https://www.promptfoo.dev/docs/guides/evaluate-coding-agents/)
- [Inspect AI](https://inspect.aisi.org.uk/)
- [AgentEvals](https://github.com/langchain-ai/agentevals)
