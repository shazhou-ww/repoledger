# 实现 Agent Session Trajectory 评估基线

## Implementation acceptance criteria

- 一个文档化的开发命令可以运行指定 scenario，启动全新 Agent session，并在 hard
  invariant 失败、超时或 verifier 无法取得必要证据时返回非零状态。
- Canonical runner 在具备本地授权时可运行 Copilot CLI；缺少授权、容器运行时或
  模型配置时，preflight 在启动 session 前给出明确诊断且不泄露 secret。
- 每个写能力场景使用一次性 fixture、隔离 HOME/用户配置和 disposable Git remote；
  eval 结束后可证明没有修改真实 Repoledger checkout、authoritative remote 或持久用户
  preference。
- 被测 CLI 来自当前 checkout 的真实 package artifact，被测 skill 来自当前 checkout，
  运行记录包含二者 hash，避免误测全局安装或旧缓存。
- Scenario contract 和 trajectory artifact 有版本字段、稳定 scenario id，并记录
  commit、Agent/runtime、模型、工具版本、开始/结束状态与可见 tool events；原始 secret
  和隐藏推理不进入 artifact。
- Verifier 支持必须发生、不得发生、按序发生和允许中间额外步骤的轨迹约束，并以
  文件、Git ref、命令退出状态和 Repoledger JSON 报告验证最终状态，而不是相信 Agent
  的最终叙述。
- 首批场景分别证明 task-free routing、`new` stop boundary、unknown-verb 零写入、
  `status` 只读、delivery approval gate 和 abandon confirmation gate；每个场景包含至少
  一个能检出预期违规的 verifier 测试。
- 开发者可以只运行受改动影响的 focused scenarios，也可以运行完整场景集；关键
  非确定性场景支持重复运行并分别报告 hard pass rate 与 soft observations。
- 仓库文档明确哪些改动必须运行 session eval、何时只需确定性测试、何时需要发布前
  完整运行，以及真实 VS Code host smoke 仍需单独执行的 fidelity 边界。
- Agent 指令要求先完成相关确定性验证，再运行匹配的 session scenario；失败报告
  区分 skill ambiguity、CLI contract、runner/environment、模型 variance 和 verifier 缺陷。
- Session eval 不进入默认快速单元测试路径；CI 或发布自动化只有在显式配置隔离环境
  与授权时才运行需要模型的场景，未配置时不会伪造通过结果。
