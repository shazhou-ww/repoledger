# 为新 idea 创建结构化契约与必需 ledger

## Intent

让 `silvermoon create-idea` 直接生成可供人和 Agent 共同细化的结构化 idea
scaffold，而不是三个空白 world 文档。每个新 idea 必须从创建时就拥有
`ledger.md`，以统一承载 implementation 和 deployment 条目的完成状态。

## Context

当前 `create-idea` 创建空白的 `Idea.md`、`Implementation.md` 和
`Deployment.md`，并把 `ledger.md` 视为可选文件。后续 Agent 必须自行回忆文档结构，
也可能在开始工作后才补建 ledger，导致不同 idea 的契约粒度和 continuation 方式不一致。

Silvermoon 尚未发布，当前仓库也是它唯一的消费方，因此无需保留 optional ledger 或空白
scaffold 的向后兼容行为。现在可以一次性收紧 layout、迁移现有 idea，并使 CLI、skill、
文档和测试采用同一个模型。

现有结构化模板仍有两个会误导作者或触发工具 warning 的占位细节：

- `Idea.md` 使用 `# Idea` 作为大标题，看起来像最终标题，没有提示 Agent 应根据具体
  idea 内容替换。
- `ledger.md` 在 Implementation 和 Deployment 下重复使用 `Steps` 与
  `Acceptance criteria` 小标题，会触发禁止重复 heading 的 Markdown lint warning。

World 文档与 ledger 承担不同职责：

- `Idea.md` 定义目标、上下文、范围和约束。
- `Implementation.md` 与 `Deployment.md` 使用可独立讨论的三级标题定义 steps 和
  acceptance criteria。
- 每条 acceptance criterion 同时说明预期结果及其证明方法，不设置重复的 validation
  section。
- `ledger.md` 只镜像 implementation 和 deployment 条目的完成状态，不重复详细要求，
  也不保存 Current、Next 或 revision frontmatter。
- checkbox 是 Agent 工作状态，不是 human approval 或 acceptance。

## Desired outcome

运行 `silvermoon create-idea` 后，新目录立即包含结构化的 `Idea.md`、
`Implementation.md`、`Deployment.md`、`ledger.md` 和 canonical `status.yaml`。

人和 Agent 可以围绕每个三级标题逐项细化契约，并在同一轮修改中同步 ledger。Agent
根据 `whats-next` action、world 文档和 ledger checkbox 推导下一步，而不需要维护额外的
Current 或 Next 摘要。Silvermoon lifecycle 仍只从 world revisions 与显式
`status.yaml` decision facts 派生。

默认 `Idea.md` 大标题从 `# Idea` 改为
`# Replace with a specific title for this idea`，明确要求作者根据具体 idea 内容替换标题，
而不是把通用名称留作最终标题。

默认 `ledger.md` 保留 `## Implementation` 与 `## Deployment` 阶段结构，并将四个三级
标题分别改为 `### Implementation steps`、`### Implementation acceptance criteria`、
`### Deployment steps` 和 `### Deployment acceptance criteria`。这样所有 heading 在
整份文档中保持唯一，同时仍能清楚区分两个阶段的 steps 与 acceptance criteria。

## Scope

### In scope

- 为三个 world entry 定义并生成默认结构模板。
- 使用 `I-Sxx`、`I-ACxx`、`D-Sxx` 和 `D-ACxx` 稳定标识三级标题条目。
- 使每个 idea root 必须包含 repository-owned regular `ledger.md`。
- 让新 scaffold 创建 ledger，并在命令结果中报告其路径。
- 在 skill 中要求修改 world steps 或 criteria 时同步 ledger；实质性改变已完成条目时
  重置对应 checkbox。
- 明确 AC 本身同时包含 observable outcome 和证明方法。
- 迁移所有现有 idea 到必需 ledger 和新的双阶段 ledger 结构。
- 更新 CLI、layout validation、diagnostics、文档、skill、package surface 和测试。
- 将默认 `Idea.md` 的大标题从 `# Idea` 改为
  `# Replace with a specific title for this idea`。
- 将默认 `ledger.md` 的四个三级标题改为 `Implementation steps`、
  `Implementation acceptance criteria`、`Deployment steps` 和
  `Deployment acceptance criteria`，并同步相关示例、文档与精确内容测试。

### Out of scope

- 让 Silvermoon core 解析 ledger 正文或校验 world 条目与 checkbox 的一一对应关系。
- 从 ledger checkbox 自动推导或写入 approval、implementation acceptance 或
  deployment acceptance。
- 为模板增加 repository-specific 配置、自定义模板发现或多语言模板选择。
- 根据创建命令的对话上下文自动编造 idea 内容、alias 或 lifecycle decision。
- 发布 npm package。

## Constraints

- `create-idea` 继续只修改 worktree；不得 stage、commit、push 或记录 decision fact。
- 模板必须提供结构和写作指导，但不得把 placeholder 表述成已经成立的需求或 AC。
- World 文档不得使用 task-list checkbox；checkbox 只存在于 ledger。
- ledger 保持在三个 nested world trees 之外，其更新不得改变任何 world revision。
- stable ID 在标题细化时应保持不变；删除、新增或实质性修改条目时必须同步 ledger。
- 这是直接切换，不保留缺少 ledger 的 legacy layout，也不保留 “optional ledger” 表述。
- `Idea.md` 的标题提示必须是可见文本，不使用会形成空 heading 的 HTML comment；填写
  契约时必须将整条提示替换为具体标题。
- ledger heading 在整份文档中必须唯一；三级标题必须包含所属阶段名称，并继续位于对应
  的 `## Implementation` 或 `## Deployment` 下。

## Open questions

无。模板结构、ledger 职责和直接切换策略已经确认。