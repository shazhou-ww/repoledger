# 实现 agent ledger continuation

## Implementation acceptance criteria

- **I01 Ledger layout：** idea root 允许可选的 `ledger.md`，且拒绝规则与 safe-path、symlink 和 snapshot 语义保持一致。
- **I02 Revision isolation：** 新增、编辑或删除 `ledger.md` 都不改变 ideal、implementation 或 deployment revision。
- **I03 Agent authoring convention：** 文档和 skill 定义 revision frontmatter、Current、Work、Checks 与 Next 的直观 Markdown 约定，同时明确它不是 storage schema。
- **I04 Continuation guidance：** `whats-next` 和 skill 为选中 idea 显示 ledger 路径，并指导 Agent 在 lifecycle hygiene 之后从未完成工作、待检查项或 blocker 继续。
- **I05 Stale context handling：** Agent guidance 要求在 ledger frontmatter 与当前 world revisions 不匹配时重新审查相关记录，不盲目延续旧 checklist。
- **I06 Decision boundary：** 所有表面明确 `[x]` 只代表 Agent 工作记录，不能自动推导或写入 approval、implementation acceptance 或 deployment acceptance。
- **I07 Remove evidence contract：** 删除 criteria evidence parser、verifier、公开 package exports 及其 schema-shaped tests，不留下 success-shaped fallback。
- **I08 Migrate current record：** 将 `evidence/layered-world-model.json` 的有效内容转为对应 idea 的 `ledger.md`，并删除旧根级 evidence artifact。
- **I09 Documentation consistency：** README、repository instructions、skill references、package allowlist 和 smoke expectations 使用同一 ledger/continuation terminology。
- **I10 Validation：** 覆盖 layout、revision isolation、guidance、package API removal 和完整 lifecycle regression，并通过 `pnpm check` 与 `pnpm check:skills`。