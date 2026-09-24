# 将项目完整改名为 Silvermoon

Created: 2026-09-24
Language: zh-CN

## Goal

将项目的当前品牌、公开产品概念和技术标识从 Repoledger 完整迁移为
Silvermoon，使 npm 包、CLI、配置、代码、schema、技能、文档、测试、发布流程和
canonical repository 坐标一致使用 `silvermoon`，且安装、使用、校验和发布链路不再把
`repoledger` 暴露为当前名称。

## Context

项目当前同时使用 `repoledger` 作为 npm 包名、可执行命令、配置文件和配置概念、源码及
测试中的标识、Agent skill 名称、文档术语、仓库内 canonical GitHub 坐标和 npm 发布标签
命名空间。GitHub repository 已由用户先行改名为 `shazhou-ww/silvermoon`，旧
`shazhou-ww/repoledger` URL 当前通过 GitHub redirect 继续工作，但仓库配置、package metadata
和文档仍把旧 URL 当作 authority。
只修改显示名称会造成安装命令、配置发现、远端校验、skill discovery 和发布自动化互相
不一致，因此本次改名必须作为一次有审查门槛的端到端迁移完成。

改名实施以当前主分支为功能基线。当前公开 CLI 已收敛为 `check`、`create-idea` 和
`whats-next`；`create-idea` 支持无 alias scaffold，`whats-next` 保留 request context、
结构化 worktree changes 和安全 publication coordinates，skill 在 implementation acceptance
前要求逐条验证 criteria evidence。Silvermoon 必须保留这些最新契约，而不是退回旧的
`whatsnext` 或手工 scaffold 流程。

Silvermoon 的产品定位是“你项目的器灵”。它不是只服务人的 Agent，也不是替人执行任务的
自动化代理，而是同时服务人和 Agent、归属于项目本身的共享工具。它观察并检查项目的真实
状态，保存双方都能理解的稳定事实，识别边界与阻塞，并回答当前唯一最高优先级的
`what's next`。当下一步需要人类判断时，它应明确停下，而不是代替人作出决定。

在 idea 创建时，`npm view silvermoon --registry https://registry.npmjs.org` 返回
`E404 Not Found`，表明无作用域包名 `silvermoon` 当时未在官方 registry 注册。这不是名称
预留；实施和发布前必须重新核验，并在名称被占用时停止，由用户决定新的包名。

## Scope

- 将产品显示名统一为 `Silvermoon`，将机器可读标识统一为 `silvermoon`，并定义适用于
  标题、正文、命令、包名、文件名、配置键、环境变量和代码符号的大小写迁移规则。
- 将 npm package、bin 命令、exports、package metadata、lockfile、pack/smoke 检查和安装
  示例迁移为 `silvermoon`；发布前重新确认官方 npm registry 上的无作用域包名仍可用。
- 迁移 CLI 命令名、帮助、JSON report、诊断、示例和用户可见输出，使公开 contract 使用
  `silvermoon`，并通过 Interface review 明确是否提供以及提供多久的旧命令兼容入口。
- 保持当前三个公开 subcommand `check`、`create-idea` 和 `whats-next` 的命令集合与行为边界；
  同步迁移 create intent、可选 alias、request context、结构化 worktree changes、publication
  coordinates、criteria evidence verifier 和 behavior manifest 中的品牌及 package 引用。
- 将 `repoledger.yaml`、相关 schema、配置发现、错误消息、fixtures 和 canonical repository
  identity 迁移为 Silvermoon 命名；为已有 checkout 提供明确、可测试且不会静默选错 authority
  的迁移路径。
- 将 Silvermoon 的公开 schema version 重新从 `v1` 开始，包括把当前 Repoledger `v3`
  配置/schema 迁移为 Silvermoon `v1`。新品牌不继承旧产品的 schema 版本序列；schema 文件、
  配置中的 `version`、校验器、生成器、fixtures、示例和文档必须使用一致的新版本号。
- 迁移源码模块、导出符号、常量、内部术语、脚本、测试和 snapshots 中代表当前产品的
  Repoledger 标识；保留协议上确有必要的历史输入兼容时，必须用集中、文档化的兼容层隔离。
- 将 Agent skill 的名称、目录、frontmatter、调用方式、模板、引用和项目指令迁移为
  Silvermoon，并验证 skill discovery 与真实安装包中的行为。
- 更新 README、开发/采用/发布文档、仓库指令、工作流、issue/PR 模板及其他当前文档，
  使其只把 Silvermoon 描述为当前产品；旧名称只可出现在明确标注的迁移说明、兼容测试或
  不可变历史事实中。
- 在 README 的首要产品介绍中表达“Silvermoon 是你项目的器灵”这一定位，说明它同时面向
  人和 Agent，以项目事实为依据检查状态、守住决策边界并回答 `what's next`；避免把它描述成
  私人助理、聊天 Agent、后台服务或会替用户自主决策的执行者。
- 以用户提供的原创线稿 [`silvermoon.svg`](./silvermoon.svg) 为基础制作 README 头图：
  清理头发区域影响阅读的孤立碎点，并在不改变人物轮廓与主要笔触的前提下，将适合保留的
  离散点连接为细线；保留原始 SVG 作为可追溯的设计输入。
- 将头图制作成一份同时适合浅色和深色背景的银灰色 SVG，以颜色呼应 Silvermoon/“银月”
  品牌；银灰线条在 GitHub 白色背景和 `#0d1117` 深色背景上的对比度均不得低于 3:1。
  README 直接引用这一份响应式资源，并提供合理尺寸和描述性 alt text。成品不得依赖脚本、
  外部字体、远程资源或 GitHub 不支持的 SVG 内嵌行为。
- 接纳已经完成的 GitHub repository 改名，将默认远端及所有受影响的 canonical URL、badge、
  workflow、发布标签命名空间和自动化权限边界更新为 `shazhou-ww/silvermoon`，并验证旧 URL
  redirect 只作为迁移行为，不会继续被当作 canonical identity。
- 对全部受影响表面执行大小写敏感和不敏感的残留清单审计，并逐项判断剩余
  `repoledger` 字符串属于允许的历史/兼容证据还是漏改。

## Out of scope

- 改变 idea 生命周期、审批模型、Git 安全边界或产品功能语义；除命名和必要迁移兼容外，
  现有行为应保持不变。
- 重写 Git 历史、删除审计证据，或把历史 commit 中的 Repoledger 字样改写为 Silvermoon。
- 在 `silvermoon` 包名被其他主体占用后自动选择相似名称、作用域包或购买/索取名称。
- 未经明确 Interface review 就永久保留旧 npm 包、旧 CLI、旧配置文件或双品牌入口。
- 首次发布 npm 包、创建或推送 release tag、触发发布 workflow、验证 registry provenance、
  执行发布后 smoke 或接受首版发布结果；这些工作由首版发布前的后续 task 定义和推进。
- 从开发机器直接发布 npm 包；任何后续发布仍必须遵守仓库的受控 workflow 和 immutable
  tag 规则。

## Implementation acceptance criteria

- **I01 命名决策：** 有一份经 Interface review 批准的迁移矩阵，覆盖显示名、npm 包、bin、
  config 文件与键、schema、环境变量、JavaScript API、skill、GitHub repository、release tag
  和兼容期限；实现与矩阵一致，不存在同一表面的双重命名。
- **I02 npm 与安装：** 官方 npm registry 在发布边界再次确认 `silvermoon` 可用；package manifest、
  lockfile、pack 内容、安装后 smoke test、导入和 CLI 调用全部使用 `silvermoon`，且仓库检查
  不依赖全局安装或旧缓存。
- **I03 CLI 与配置：** `silvermoon --help` 精确暴露 `check`、`create-idea` 和 `whats-next`
  三个公开 subcommand；全新安装可通过 `silvermoon` 完成所有既有流程，新配置名和 schema
  可被正确发现和验证。旧 package、bin、配置和命令拼写的接受或拒绝严格符合已批准的兼容
  策略，并有零副作用的正反测试。
- **I04 导航与创建契约：** 改名后仍保留无 alias 的 canonical ULID scaffold、显式 create
  intent、单一最高优先 action、不可变 observation、request context、结构化 staged/unstaged/
  untracked/conflicted changes、安全 publication coordinates 和并发 non-force push 拒绝语义；
  JSON report、diagnostic 和测试只使用 Silvermoon 品牌，不降低任何 hygiene gate。
- **I05 Schema 版本线：** Silvermoon 的 canonical config/schema 标识为 `v1`，package 中只包含
  正确命名的 Silvermoon `v1` schema；配置序列化、解析、JSON Schema 校验、CLI diagnostics、
  fixtures 和文档均把它视为 Silvermoon 的首个版本，不将其表示为 Repoledger `v3` 的别名。
  Repoledger `v3` 输入的迁移或拒绝行为符合已批准的兼容策略，并有明确测试。
- **I06 代码与测试：** 当前产品的模块、导出、符号、常量、fixtures、snapshots 和测试描述完成
  迁移；现有行为测试保持通过，新增测试覆盖包名、命令、配置、skill 和 repository identity
  的重命名边界。
- **I07 Evidence 与回归基线：** Silvermoon skill 和 package API 继续要求在 implementation
  acceptance 前为本 Idea.md 的每个 `I01` 至 `I12` criterion 生成并验证非空、顺序一致的
  criteria evidence；behavior manifest 保留当前 17 个 case 的语义覆盖，并增加重命名、schema
  `v1` 和旧品牌拒绝/迁移 case，不以简单 `ok: true` 代替 action、report 与 Git 状态断言。
- **I08 Skill 与文档：** 安装后的 skill discovery 只把 Silvermoon 作为当前 skill/产品展示，
  项目指令和所有当前文档、示例、链接、badge 及发布说明均使用新名称；迁移说明准确列出
  用户必须采取的动作。README 的开篇明确使用“你项目的器灵”作为核心产品隐喻，并准确解释
  Silvermoon 如何同时服务人和 Agent、检查项目状态、回答 `what's next` 及停在人类决策边界。
- **I09 README 头图：** README 只引用一份银灰色 SVG；其线条在 GitHub 白色背景和
  `#0d1117` 深色背景上的对比度均至少为 3:1，不需要 `<picture>`、主题检测或双份资源。
  分别以窄屏和桌面宽度检查时，图像保持比例、不过度放大、不横向溢出；头发区域不再出现
  用户指出的干扰性孤立碎点，连线粗细与主体线稿协调。用户对两种背景下的视觉结果进行
  主观验收。
- **I10 SVG 安全与可维护性：** 发布版本具有准确 `viewBox`，不包含脚本、事件处理器、外部引用、
  嵌入位图、字体依赖或编辑器私有冗余；优化前后在目标 README 尺寸下保持预期轮廓和细节，
  Markdown/link 检查覆盖唯一的头图资源路径。
- **I11 残留审计：** 对 tracked files 执行大小写敏感和不敏感的 `repoledger` 搜索。每个剩余
  命中都属于明确列举的不可变历史事实或已批准、带期限的兼容测试/迁移说明；不存在未解释的
  当前品牌、公开 contract、文件名、配置名、代码标识或 URL 命中。
- **I12 验证：** 与改名相关的定向测试、package 内容检查、安装后 smoke、Markdown/link 检查、
  `pnpm check`、`pnpm check:skills`、`git diff --check` 和 Silvermoon 对应的 repository
  commit/remote 检查全部通过；pack/smoke 明确断言新 bin、`schema/v1.json`、README 和公开
  exports 存在，且不再打包旧品牌入口或 `schema/v3.json`。

## Deployment acceptance criteria

- **D01 GitHub 迁移：** 已改名的 GitHub repository 的默认分支、保护规则、Actions、
  secrets/environment 引用和 canonical remote 坐标可用；新的 clone URL 与仓库内配置一致，
  旧 URL redirect 已验证但不再作为配置 authority。

## Constraints

- `silvermoon` 的 npm 可用性属于竞态条件；任何本地 404 都不能替代发布边界的再次核验，
  更不能视为名称所有权。本任务只记录实现期间的可用性证据，不执行或接受首次发布。
- GitHub repository 改名已经完成；实现不得尝试重复改名。canonical URL 切换、旧 URL
  redirect 验证仍是本任务的外部动作。npm 首次发布及其权限、顺序和回滚方案由后续 task
  负责，不得由本任务创建 tag 或触发 workflow。
- 改名必须保持 primary authority 可验证。迁移 canonical repository/config 时，旧 checkout、
  新 checkout 和 URL redirect 的行为必须分别测试，不能通过放宽 repository identity 校验来
  避免迁移设计。
- Silvermoon `v1` 与历史 Repoledger `v1` 是不同产品命名空间中的版本，不得仅凭数字相同
  误接受旧格式；产品标识、文件名、字段集合和迁移入口必须共同消除版本歧义。
- 历史 idea、status revision 和 Git commit 是审计事实。不得为了实现零文本命中而重写历史；
  若 tracked 历史 idea 文档必须修改，需先证明不会使已接受 revision 失效，或为受影响 idea
  取得新的显式审批/接受事实。
- 不提交 npm token、GitHub credential、用户目录、私有 registry 配置或其他 secret。
- 改名期间禁止从开发机器发布；遵守当前仓库发布文档，直到该流程本身经审查迁移并验证。

## Human review checkpoints

- **Scope review — required before implementation:** 用户或 accountable owner 审查本
  `Idea.md` 的 goal、scope、out of scope、criteria 和 constraints，确认“彻底替换”允许的
  历史/兼容例外。
- **Interface review — required before affected implementation:** 用户或 maintainer 审查命名
  迁移矩阵、旧 npm/CLI/config/skill 兼容策略、弃用期限及用户迁移步骤。
- **Architecture review — required before repository/config migration:** maintainer 审查
  package、CLI、配置发现、schema、repository identity、skill 和 release pipeline 的迁移顺序、
  authority 边界与回滚方案。
- **Visual review — required before accepting the README artwork:** 用户审查清理后的线稿、
  头发碎点/连线处理、单一银灰资源在浅色与深色背景上的效果，以及窄屏/桌面 README 渲染，
  批准最终头图版本。
- **Deployment review — required before canonical cutover acceptance:** repository owner 审查
  已完成的 GitHub 改名现状、canonical URL 切换和旧 URL redirect；npm 首发审查明确留给
  后续 task。
- **Delivery acceptance — required:** 用户或 accountable owner 审查已发布实现、残留审计、
  验证证据和 canonical repository 迁移结果，并接受精确 primary commit。

## References

- [Repository task workflow](../../docs/repository-tasks.md)
- [npm package release process](../../docs/npm-package-releases.md)
