# 验证 agent ledger 在真实工作流中可延续

## Deployment acceptance criteria

- **D01 Cross-session continuation：** 一个没有原对话历史的 Agent 能从已发布 skill、`whats-next` 和 idea `ledger.md` 恢复当前 action、已完成工作、待检查项、阻塞与下一步。
- **D02 Lifecycle isolation：** 已发布 CLI 在 ledger 更新前后保持相同的三层 revisions 和 derived state，并且不会把 checklist 当作 human decision。
- **D03 Published surface：** 已发布 package、skill 和文档不再暴露 criteria evidence API 或要求仓库根级 evidence artifact。