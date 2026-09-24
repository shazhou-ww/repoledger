# 实现结构化 idea scaffold 与必需 ledger

## Steps

### I-S01: 定义集中维护的默认模板

为 `Idea.md`、`Implementation.md`、`Deployment.md` 和 `ledger.md` 定义唯一的默认
source，使生产代码与测试使用同一份精确内容。模板使用稳定 section 名称、HTML 注释写作
提示和三级标题示例，不生成看似已经完成的业务内容。

### I-S02: 扩展 create-idea scaffold

让 `create-idea` 原子创建四份文档和 canonical `status.yaml`，并在
`createdIdea` result 中返回 `ledgerPath`。把 ledger 纳入 collision、partial write 和
rollback 语义，继续保证命令不改变 index、commit、refs 或 remote。

### I-S03: 将 ledger 收紧为必需 layout

把 idea-root ledger validation 从 optional regular file 改为 required regular file。
缺失、symlink、directory、unsafe path 和 snapshot target 必须遵循现有明确诊断与安全
语义。删除代码和 diagnostics 中暗示 ledger 可选的分支与措辞。

### I-S04: 迁移现有 idea

为所有现有 idea 补齐 `ledger.md`，并把已有 ledger 从 revision frontmatter 以及
Current、Work、Checks、Next 结构迁移为 Implementation 与 Deployment 两个阶段下的
Steps 和 Acceptance criteria checklist。迁移必须保留能够由现有 world 文档证明的完成
事实，不得把 checkbox 转换为 lifecycle acceptance。

### I-S05: 更新 Agent authoring workflow

更新 skill 和 repository guidance，要求 Agent 在填写或调整
`Implementation.md`/`Deployment.md` 的 step 或 AC 时，同步 ledger 的稳定 ID 与短标题。
新增条目保持未勾选；实质性改变已完成条目的要求或证明方法时重置 checkbox。下一步由
action、world contract 和 ledger 状态推导，不维护 Current 或 Next。

### I-S06: 对齐公开文档与 package surface

更新 README、adoption guidance、repository instructions、CLI 文案、package allowlist
和 installed-package smoke expectations，统一描述结构化 scaffold、必需 ledger、三级标题
contract 和 checkbox decision boundary，不留下 empty scaffold 或 optional ledger 表述。

### I-S07: 更新并扩充回归测试

覆盖精确模板内容、必需 ledger layout、atomic cleanup、collision retry、Git non-mutation、
world revision isolation、所有 check snapshot target、skill guidance、package contents
与完整 lifecycle。先运行最小相关测试，再运行仓库规定的完整检查。

## Acceptance criteria

### I-AC01: 新 scaffold 包含完整结构

每次成功的 `create-idea` 都创建结构化 `Idea.md`、`Implementation.md`、
`Deployment.md`、`ledger.md` 和 canonical `status.yaml`，并返回全部路径。create tests
应断言五个文件的精确内容、result shape、untracked paths 以及没有 add、commit 或 push。

### I-AC02: Ledger 是所有 idea 的必需文件

任何 snapshot 中缺少 idea-root `ledger.md` 的 idea 都无效，regular file 才有效，symlink
和其他 file type 必须被拒绝。layout 与 check target tests 应分别证明 worktree、staged、
commit、HEAD 和 remote 路径遵循同一 contract。

### I-AC03: World contract 支持逐项细化

默认 Implementation 与 Deployment 模板分别包含 Steps 和 Acceptance criteria，且每个
示例条目使用三级标题和稳定 ID。默认 Idea 模板包含 Intent、Context、Desired outcome、
Scope、Constraints 与 Open questions。精确模板测试和 installed-package smoke test
应证明发布内容一致。

### I-AC04: AC 自包含证明方法

skill 和模板明确要求每条 acceptance criterion 同时描述 observable outcome 与证明方法，
且不生成独立 Validation section。skill tests 应断言该 guidance，并拒绝恢复 plain-list
criteria 或重复 validation convention 的文档漂移。

### I-AC05: Ledger 同步规则明确且不越过 decision boundary

skill 明确要求 world 条目与 ledger 同步、实质性修改时重置 checkbox，并说明 checkbox
既不代表 human decision，也不得写入 status。skill tests 和 lifecycle regression 应证明
ledger 全部勾选不会改变 derived state。

### I-AC06: Ledger 保持 revision isolation

新增、编辑或删除 ledger 内容都不改变 ideal、implementation 或 deployment revision。
revision matrix tests 应覆盖三种操作，并证明只有对应 world tree 的修改才触发级联变化。

### I-AC07: 当前仓库完成直接迁移

仓库中的每个 idea 都包含新结构 ledger，且当前 world 文档中的有效完成事实得到保留。
`silvermoon check --worktree` 和 repository fixture tests 应证明不存在 legacy exception、
optional fallback 或需要发布后兼容的双重布局。

### I-AC08: 完整验证通过

目标测试通过后，`pnpm check`、`pnpm check:skills`、package allowlist、installed-package
smoke、Markdown link validation 与 `git diff --check` 全部成功；任何失败都必须显式修复或
报告，不得使用 success-shaped fallback。