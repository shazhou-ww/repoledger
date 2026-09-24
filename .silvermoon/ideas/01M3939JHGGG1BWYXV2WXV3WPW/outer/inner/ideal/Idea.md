# 用 agent ledger 延续 idea 工作上下文

Created: 2026-09-24
Language: zh-CN

## Goal

将现有 evidence artifact 改造成每个 idea 自带的 `ledger.md`。它是面向 Agent 和人的
continuation surface，用于记录已经完成、尚未完成、已经检查、尚未检查、当前阻塞和下一步，
使后续会话或另一个 Agent 不依赖对话历史也能安全继续同一个 idea。

`ledger.md` 是直观的工程术语；continuation 是它提供的能力，而不是文件名。它不属于
Ideal World（道心）、Inner World（内景）或 Outer World（现世），也不是 Silvermoon core
需要解析或验证的 evidence contract。

## Context

当前 implementation evidence 使用仓库根目录下的 JSON artifact，并由 Silvermoon package
API 校验 criterion、locator 和 implementation revision。实际上 Silvermoon lifecycle、
`check`、`whats-next` 和 status derivation 都不需要消费这些 evidence；真正的消费者是执行
idea 的 Agent。

把 Agent 的工作进度塑造成 core evidence schema，会引入不必要的 parser、公开 API 和格式
兼容责任，也无法自然记录普通任务、检查、等待条件、阻塞和下一步。Markdown checklist 更适合
这类跨会话工作账本。

## Contract

每个 idea 可以在 `status.yaml` 和 `outer/` 同级拥有可选的 `ledger.md`：

```text
.silvermoon/ideas/<IDEA_ID>/
├── status.yaml
├── ledger.md
└── outer/
    └── ...
```

- `ledger.md` 是 Agent-owned operational state，不是规范入口、decision fact 或第四个 World。
- Silvermoon core 允许该文件存在，但不解析正文、不校验 checklist，也不从中推导 lifecycle。
- `ledger.md` 不参与 ideal、implementation 或 deployment revision；更新账本不得导致状态回退。
- checklist 的 `[x]` 只表示 Agent 记录的工作已完成或检查已执行，不表示 human acceptance。
- approval、implementation acceptance 和 deployment acceptance 仍只能由人在 `status.yaml`
  中记录对应的当前 revision。
- ledger 可以记录测试 locator、命令、artifact 和结果作为工作说明，但这些内容不形成独立
  evidence schema 或公开 API contract。
- ledger frontmatter 记录整理账本时观察到的 world revisions。revision 不匹配表示相关记录
  可能过期，Agent 必须重新审查；Silvermoon core 不负责诊断或自动改写账本。
- skill 和 `whats-next` 应把 ledger 暴露为当前 idea 的 continuation surface。Agent 仍须先
  遵循 repository hygiene 和 lifecycle action，再从 ledger 中恢复该 action 内部的工作。

## Suggested ledger shape

```markdown
---
idealRevision: <revision>
implementationRevision: <revision>
deploymentRevision: <revision>
---

# Ledger

## Current

- State: implementing
- Focus: ...
- Blocked: ...

## Work

- [x] Completed work
- [ ] Remaining work

## Checks

- [x] Completed check
- [ ] Pending check

## Next

1. First actionable continuation step.
```

这是 Agent authoring convention，而不是 Silvermoon storage schema。Agent 可按 idea 的实际需要
增加 notes、blockers 或其他 Markdown 内容。

## Scope

- 允许 idea 根目录中的可选 `ledger.md`，并确保它位于三个 world revision 之外。
- 将 Agent workflow 从 criteria evidence verification 改为 ledger continuation。
- 删除 Silvermoon core 中只为 evidence artifact 存在的 parser、verifier 和公开 exports。
- 将当前 layered-world-model JSON evidence 转为所属 idea 的 ledger，并清除仓库根级 evidence
  artifact。
- 更新 skill、CLI guidance、文档、测试和 package surface，使职责边界一致。

## Out of scope

- 从 checklist 自动写入、推断或建议 human acceptance。
- 让 Silvermoon core 解释 ledger section、task 状态或 frontmatter freshness。
- 把 ledger 纳入任何 world revision。
- 建立通用任务管理器、事件日志、多人协作协议或跨 idea dependency system。
- 为 ledger 定义可长期兼容的机器可读 schema。