# 验证结构化 scaffold 进入真实工作流

## Steps

### D-S01: 验证 fresh repository 创建流程

在只包含 Silvermoon 配置的全新 repository fixture 中运行已安装 CLI 的
`create-idea --json`，检查生成文件、模板内容、result paths、Git non-mutation 以及后续
`whats-next <ULID>` routing。

### D-S02: 验证必需 ledger 的拒绝与迁移路径

对缺失 ledger、unsafe ledger 和完成迁移的 repository snapshots 分别运行 check，确认
无 legacy bypass，并确认当前仓库所有 idea 都满足新 layout。

### D-S03: 验证 Agent continuation 行为

从一个没有原对话历史的 Agent 视角读取 skill、world 文档和 ledger，确认它能定位未完成
implementation/deployment 条目、理解详细要求，并在不依赖 Current 或 Next 摘要的情况下
推导下一项工作。

### D-S04: 验证 package 与共享主分支候选

执行 package dry-run、installed-package smoke 和 remote-aware repository check，确认 npm
artifact 包含模板实现与最新 skill，且主分支候选保留 world revision、ledger isolation 和
decision history。

### D-S05: 验证已安装 CLI 的标题模板

从当前 packed artifact 安装 Silvermoon，在隔离 consumer repository 中运行
`create-idea --json`。读取生成的 `Idea.md` 与 `ledger.md`，确认可替换的大标题提示和四个
唯一阶段小标题与 source checkout 完全一致。

### D-S06: 验证 repository-owned 文档迁移

扫描共享主分支候选中的所有 repository-owned `Idea.md` 与 `ledger.md`，确认不存在通用
`# Idea` 标题，每份 ledger 都包含四个预期阶段小标题且没有重复 heading。运行完整
repository checks，确认迁移未破坏 layout、world revision 或 package surface。

## Acceptance criteria

### D-AC01: 已安装 CLI 生成相同 scaffold

从 packed artifact 安装的 `silvermoon create-idea --json` 必须生成与 source checkout
完全相同的五文件 scaffold，并报告 `ledgerPath`。installed-package smoke 输出和文件内容
断言作为证明。

### D-AC02: 真实仓库不接受缺失 ledger

移除任一 idea 的 ledger 后，已安装 CLI 的 check 必须以明确 missing-ledger diagnostic
失败；恢复 regular file 后通过。fresh fixture 与当前仓库 candidate check 共同作为证明。

### D-AC03: Agent 能从双阶段 ledger 继续工作

Agent 仅使用 `whats-next` action、Implementation/Deployment contracts 和 ledger，就能指出
所有未完成条目及其详细证明要求；skill review 或无历史会话演练记录作为证明，不需要
Current、Next 或 revision frontmatter。

### D-AC04: Lifecycle 与 ledger 状态保持隔离

勾选、取消或重排 ledger checkbox 不得改变三个 world revisions 或 derived lifecycle
state，也不得自动产生 approval/acceptance status diff。发布候选上的 revision comparison
和 status diff 作为证明。

### D-AC05: 发布候选表面一致

README、skill、adoption guidance、CLI output、package contents 和 repository layout
只描述 required ledger 与 structured scaffold，不再出现 optional ledger、empty scaffold
或独立 Validation section 的当前行为说明。repository search、package smoke 和完整
`pnpm check` 作为证明。

### D-AC06: Packed CLI 生成修正后的标题

installed-package smoke 必须证明 packed CLI 生成的 `Idea.md` 以
`# Replace with a specific title for this idea` 开头，ledger 使用
`Implementation steps`、`Implementation acceptance criteria`、`Deployment steps` 和
`Deployment acceptance criteria`，并继续生成正确的 stable ID checkbox。e2e test 的成功
输出作为证明。

### D-AC07: 共享候选中的现有文档无重复 heading

共享主分支候选中的所有现有 idea 文档都不得保留 `# Idea`，每份 ledger 的 Markdown
heading 值必须唯一。contract scan 和 `silvermoon check --commit` 必须在已发布候选上通过。

### D-AC08: 最终发布候选验证通过

对稳定 deployment revision 执行 `pnpm check`、`pnpm check:skills`、
`silvermoon check --commit` 和 `git diff --check`，全部必须成功；失败时不得沿用更早
revision 的结果。