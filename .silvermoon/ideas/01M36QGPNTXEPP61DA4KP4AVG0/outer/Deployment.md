# 验证 Agent Session Trajectory 评估基线进入现世

## Deployment acceptance criteria

- `pnpm check`、新增 verifier 自测以及 `silvermoon check --commit HEAD` 均通过。
- 至少一次 canonical Agent 的完整代表性 session 成功，并保留可供 delivery review
  检查的摘要。
- 发布候选包含已评审的 harness、故障注入结果、完整验证和使用文档。
- 真实 VS Code host smoke 验证 skill discovery、工具面和用户交互 gate，不以 Copilot
  CLI 自动化结果替代。
