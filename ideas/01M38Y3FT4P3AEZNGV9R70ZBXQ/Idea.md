# 用三层世界模型组织 Silvermoon idea 与级联 revision

Created: 2026-09-24
Language: zh-CN

## Goal

将 Silvermoon 的 repository metadata 和 idea lifecycle 收拢到固定的 `.silvermoon/`
命名空间，并让每个 idea 的文件结构与 Ideal World（道心）、Inner World（内景）、
Outer World（现世）三层世界模型同构。三层分别拥有独立且级联的 Git tree revision，
使道心变化回到 preparing、内景变化回到 implementing、现世变化只回到 deploying，
避免现世的变化无谓地推翻已经成立的内景 decision。

最终布局为：

```text
.silvermoon/
├── config.yaml
└── ideas/
    └── <IDEA_ID>/
        ├── status.yaml
        └── outer/
            ├── Deployment.md
            └── inner/
                ├── Implementation.md
                └── ideal/
                    ├── Idea.md
                    └── ...
```

## Context

Silvermoon v1 当前仍从仓库根目录的 `silvermoon.yaml` 读取可配置 `ideasDirectory`，并沿用
Repoledger 的单一 idea tree revision：一个 idea folder 内任意受跟踪内容变化，都会使
`approvedRevision`、`implementationAcceptedRevision` 和 `deploymentAcceptedRevision`
相对同一个 revision 失效。这个模型无法表达三个阶段不同的知识边界。

例如，一个 idea 已进入 implementing 后，仅补充 deployment acceptance criteria 也会改变整个
idea revision，状态因而退回 preparing。反过来，如果只把文档拆成三个平级文件但仍独立计算
hash，ideal 或 implementation 变化又不会天然使外层 acceptance 失效，调用方必须额外拼接
revision 或维护依赖关系。

三层嵌套 Git tree 同时解决两个问题：

- Ideal World（道心）的 `ideal/` tree 表示想要什么以及不可变的产品边界；
- Inner World（内景）的 `inner/` tree 包含 implementation contract 和完整
  `ideal/` tree；
- Outer World（现世）的 `outer/` tree 包含 deployment contract 和完整
  `inner/` tree。

Git tree 的递归对象关系提供单向级联：ideal 变化会改变三层 revision，inner 自身内容变化会
改变 inner 与 outer revision，outer 自身内容变化只改变 outer revision。`status.yaml` 位于
三层 revision tree 之外，因此记录 decision 不会改变 decision 所绑定的 candidate。

Silvermoon schema 已以新品牌重新归一为 v1。本设计直接定义 Silvermoon 的最终 contract，
不增加 Repoledger schema major version，也不读取、迁移、转换或诊断旧品牌布局。已经完成的
rebranding idea 和历史 idea 保持不可变历史；本 idea 作为后续当前 contract 取代其中关于配置
位置和 idea layout 的旧基线。

## World terminology

Silvermoon 对三层世界使用以下固定中英文术语：

| Canonical English term | Canonical Chinese term | Repository path |
|---|---|---|
| Ideal World | 道心 | `outer/inner/ideal/` |
| Inner World | 内景 | `outer/inner/` |
| Outer World | 现世 | `outer/` |

英文界面和机器可读说明使用 `Ideal World`、`Inner World`、`Outer World`；中文文档和
面向人的中文说明使用“道心”“内景”“现世”，首次出现时并列中英文。三层关系的品牌化
概括为“道心立意，内景成形，现世验真”。目录名继续使用稳定的小写 `ideal`、`inner`、
`outer`，它们是 path segment，不是另一套产品术语。当前 skill、CLI guidance、schema
description 和文档不得使用“理想世界”“内心世界”“内在世界”“内部世界”“外在世界”
“外部世界”“内层世界”“外层世界”等近义翻译指代这三个正式概念。

## World and document contract

- Ideal World（道心）的 `ideal/` 是 opaque tree，唯一规范入口为 `Idea.md`。它描述目标、
  背景、产品边界、
  scope 和 out-of-scope。同目录的其他文件只能作为 `Idea.md` 所定义 ideal 的辅助材料，
  例如设计图、调研、样例或领域说明；它们可以扩充证据和细节，但不能成为绕过或替代
  `Idea.md` 的第二份规范入口。
- Inner World（内景）的 `inner/` 是 opaque implementation tree，固定入口为
  `Implementation.md`，并完整包含
  `ideal/`。Implementation plan 和 implementation acceptance criteria 由
  `Implementation.md` 定义；inner 自有的其他文件只能作为它的辅助材料，例如 architecture、
  protocol、test design 或 implementation note，不能独立定义另一套 implementation contract。
- Outer World（现世）的 `outer/` 是 opaque deployment tree，固定入口为
  `Deployment.md`，并完整包含 `inner/`。
  Deployment plan 和 deployment acceptance criteria 由 `Deployment.md` 定义；outer 自有的
  其他文件只能作为它的辅助材料，例如 rollout manifest、observation query、runbook 或
  rollback note，不能独立定义另一套 deployment contract。
- ideal、inner 和 outer 三层都允许零个或多个 repository-owned 辅助文件。辅助文件必须由
  同层入口文档的正文或清晰上下文说明其用途，并在冲突时服从同层入口文档；Silvermoon 不把
  文件扩展名、名称或数量限制为 Markdown，也不尝试从辅助文件推断新的 lifecycle phase。
  每个辅助文件参与所在层及所有外层 revision。
- `.silvermoon/ideas/<IDEA_ID>/status.yaml` 保存 identity、可选 alias、abandonment 和三个
  decision revision。它不参与 ideal、inner 或 outer revision。

## Revision and state contract

对同一个 canonical ULID，Silvermoon 从选定 snapshot 计算：

- `idealRevision`：`outer/inner/ideal/` 的 canonical Git tree object ID；
- `implementationRevision`：`outer/inner/` 的 canonical Git tree object ID；
- `deploymentRevision`：`outer/` 的 canonical Git tree object ID。

Revision 使用仓库实际 Git object format，不假设固定为 SHA-1。HEAD、worktree、staged、
commit 和 remote snapshot 对相同 bytes 与 modes 必须得到相同 revision。

`status.yaml` 继续使用以下 decision facts：

```yaml
version: 1
id: <IDEA_ID>
approvedRevision: <idealRevision>
implementationAcceptedRevision: <implementationRevision>
deploymentAcceptedRevision: <deploymentRevision>
```

可选 `alias` 和 canonical `abandoned: true` 语义保持不变。状态按固定优先级推导：

1. `abandoned: true` 时为 abandoned；
2. `approvedRevision` 不匹配当前 `idealRevision` 时为 preparing；
3. `implementationAcceptedRevision` 不匹配当前 `implementationRevision` 时为 implementing；
4. `deploymentAcceptedRevision` 不匹配当前 `deploymentRevision` 时为 deploying；
5. 三个 decision 都匹配时为 completed。

因此修改范围与回退状态形成以下 contract：

| Changed path | Invalidated decisions | Derived state after prior completion |
|---|---|---|
| `outer/inner/ideal/**` | approval, implementation, deployment | preparing |
| `outer/inner/Implementation.md` 或 inner 自有 artifact | implementation, deployment | implementing |
| `outer/Deployment.md` 或 outer 自有 artifact | deployment | deploying |
| `status.yaml` | none by content hashing | determined by its explicit facts |

旧 revision facts 保留为审计历史，在 candidate 重新匹配前自然失效；Silvermoon 不自动删除、
重写或推断新的 approval/acceptance。

## Scope

- 将配置唯一发现路径固定为 `.silvermoon/config.yaml`，将 idea root 固定为
  `.silvermoon/ideas/`，并从 Silvermoon v1 schema、parser、serializer 和示例中删除
  `ideasDirectory`。
- 建立一个集中、内部使用的 metadata layout contract，统一计算 config、idea root、idea
  folder、status、outer、inner、ideal 和三个固定入口文档的 repository-bound safe path。
- 将 idea inspection 从 sibling folder/status 配对改为自包含
  `.silvermoon/ideas/<IDEA_ID>/` 检查，并保持 canonical ULID、status id、alias uniqueness、
  regular-file、directory 和 symlink 防护。
- 为 ideal、implementation 和 deployment 分别计算 Git tree revision，并在所有 snapshot
  target 上实现相同的递归级联语义。
- 按三层 revision 推导五态 lifecycle，保持 abandoned 的显式人工 decision 和最高优先级。
- 将 authoring convention 拆分到三个入口文档：`Idea.md` 定义 ideal，
  `Implementation.md` 定义 implementation plan 与 implementation acceptance criteria，
  `Deployment.md` 定义 deployment plan 与 deployment acceptance criteria；每层其他文件均
  明确作为对应入口文档的辅助材料。
- 让 criteria extraction、criteria evidence verification 和 implementation acceptance 读取
  当前 `Implementation.md`，并绑定完整 `implementationRevision`；deployment acceptance
  绑定完整 `deploymentRevision`。
- 更新 `create-idea`，使一次成功调用原子创建三个空入口文档和 canonical `status.yaml`，
  并在碰撞或 partial failure 时只回滚本次调用拥有的路径。
- 让 `whats-next`、`check`、create preflight、snapshot inspection、publication guidance、
  package smoke、skill、repository instructions 和当前文档统一使用新布局与三层术语。
- 更新 Agent skill 与 `whats-next` 的 human/JSON guidance，使 preparing 明确指向
  `Idea.md` 及其 ideal 辅助材料，implementing 明确指向 `Implementation.md` 及其 inner
  辅助材料，deploying 明确指向 `Deployment.md` 及其 outer 辅助材料。Guidance 必须说明
  辅助材料从属于对应入口文档，并提示修改更内层内容会按 revision 级联回退；面向人的输出
  同时使用正式英文与当前 locale 的正式中文世界名称。
- 保留显式 create intent、单一最高优先 action、structured worktree changes、immutable
  observation、expected remote tip 和 non-force publication safety。

## Out of scope

- 读取、迁移、移动、删除或自动修复 `silvermoon.yaml`、`repoledger.yaml`、根目录 `ideas/`、
  `.repoledger/` 或其他旧布局。
- 提供 `migrate` subcommand、一次性迁移脚本、双读、fallback discovery、兼容期限或
  legacy-layout diagnostic。
- 允许项目配置 metadata root、idea root、三层目录名、status filename 或三个入口文档名。
- 让 `status.yaml` 参与任一 candidate revision，或在 candidate 变化时自动写入、清除 decision
  facts。
- 将三层内容限制为仅一个 Markdown 文件；固定入口之外的同层 artifacts 仍是对应 opaque
  world tree 的一部分。
- 改变 canonical ULID、alias selector、显式人工 approval/acceptance、abandonment、Git
  hygiene 或 ordinary non-force publication 模型。
- 重写已经发布的 rebranding idea、历史 idea 或 Git history 来采用新结构。

## Implementation acceptance criteria

- **I01 固定 metadata layout：** 单一 layout contract 精确返回
  `.silvermoon/config.yaml`、`.silvermoon/ideas/`、
  `.silvermoon/ideas/<IDEA_ID>/status.yaml`、
  `.silvermoon/ideas/<IDEA_ID>/outer/Deployment.md`、
  `.silvermoon/ideas/<IDEA_ID>/outer/inner/Implementation.md` 和
  `.silvermoon/ideas/<IDEA_ID>/outer/inner/ideal/Idea.md`；当前源码不存在第二套 layout
  常量或从配置覆盖路径的入口。
- **I02 Silvermoon v1 配置：** schema、parser、serializer、fixtures 和示例只从
  `.silvermoon/config.yaml` 读取 Silvermoon v1，且不包含或接受 `ideasDirectory`。
  Canonical key order、LF bytes、unknown-key rejection、credential-free repository URL、
  branch validation、regular-file 和 symlink boundary 均有精确测试。
- **I03 自包含 idea validation：** checker 只枚举
  `.silvermoon/ideas/<canonical-ULID>/`，并要求 canonical status 与三层固定目录和入口文档。
  Missing layer、wrong type、mismatched status id、duplicate alias、noncanonical identity、
  unexpected status filename 和任意层 symlink escape 均产生稳定诊断。
- **I04 三层 revision：** 对固定 fixture，`idealRevision` 精确等于 ideal tree object ID，
  `implementationRevision` 精确等于包含 ideal 的 inner tree object ID，
  `deploymentRevision` 精确等于包含 inner 的 outer tree object ID。Revision 支持仓库实际
  object format，且不包含 `status.yaml`。
- **I05 级联矩阵：** Table-driven tests 从三个 decision 均匹配的 completed fixture 出发：
  改变 ideal artifact 后仅派生 preparing；改变 inner 自有 artifact 后仅派生 implementing；
  改变 outer 自有 artifact 后仅派生 deploying；只改变 alias 或重写等价 decision facts 不改变
  三个 candidate revision。每个 case 精确断言变化与未变化的 revision。
- **I06 状态推进：** 从空 decision facts 开始，写入当前 `idealRevision` 后状态为
  implementing；再写入当前 `implementationRevision` 后为 deploying；再写入当前
  `deploymentRevision` 后为 completed。任一字段的 stale、missing、malformed 或非当前
  primary-history revision 均不得被当作当前 acceptance。
- **I07 Create scaffold 与回滚：** 在 clean、synchronized primary 上运行
  `silvermoon create-idea --json`，只创建一个 idea folder、三个 0-byte 入口文档和 canonical
  status bytes。ULID collision 会安全重试；任一步骤 partial failure 只删除本次调用仍拥有的
  paths，不修改既有 bytes、index、HEAD、refs 或其他并发创建内容。
- **I08 Snapshot 一致性：** default HEAD、worktree、staged、explicit commit 和 remote checks
  对相同 tree 返回相同三层 revision；worktree/staged 的 mode、rename、untracked 和 deletion
  会归入正确层。Immutable target inspection 不调用 Git worktree mutation，也不受调用者当前
  checkout 中旧布局文件影响。
- **I09 文档与辅助材料归属：** Authoring contract、Agent skill 和当前文档明确规定
  `Idea.md`、`Implementation.md`、`Deployment.md` 是各层唯一规范入口；ideal、inner、outer
  均允许任意 repository-owned 辅助文件，但它们分别只能辅助同层入口文档，不能成为第二入口
  或独立 lifecycle contract。Tests 在三层分别加入不同扩展名和嵌套辅助文件，并断言它们只
  改变所在层及外层 revision，checker 不按文件名猜测额外 phase。
- **I10 世界术语：** Skill、`whats-next` human guidance、JSON details 的 display metadata、
  schema descriptions 和当前用户文档统一使用 `Ideal World`/“道心”、
  `Inner World`/“内景”、`Outer World`/“现世”，并在适合的产品说明中使用
  “道心立意，内景成形，现世验真”。目录和稳定机器标识继续使用
  `ideal`、`inner`、`outer`。Tests 拒绝当前表面出现未批准的同义翻译，并精确断言三个 phase
  guidance 使用对应的正式世界名称。
- **I11 Criteria 与 evidence：** authoring 和 parser tests 要求 implementation criteria 位于
  `Implementation.md`、deployment criteria 位于 `Deployment.md`，而 `Idea.md` 不再承载这两个
  phase heading。`verifyCriteriaEvidence` 按稳定 criterion ID 验证当前
  `implementationRevision` 的完整 criteria，并拒绝 missing、reordered、empty 或绑定 stale
  inner candidate 的 evidence。
- **I12 Skill 与 whats-next guidance：** Agent skill 和 `whats-next` 的 human/JSON action
  guidance 对 preparing、implementing、deploying 分别返回对应入口文档路径、同层辅助材料
  root、当前层 revision 和需要记录的 decision revision。输出明确说明辅助文件必须支持而非
  替代入口文档，并说明编辑 ideal 会失效三层 decision、编辑 inner 自有内容会失效
  implementation/deployment、编辑 outer 自有内容只会失效 deployment。Fixture 精确断言三种
  state 的 message/details，不依赖 Agent 自行推断路径或级联效果。
- **I13 导航与 publication：** selector、多个 active ideas、无 alias idea、explicit create
  intent、branch/conflict/dirty/behind/ahead/diverged hygiene、request context、structured
  changes、publication coordinates 和 stale non-force push rejection 在新布局上保持现有
  优先级与安全语义。Guidance 明确展示当前三层 revision 及 decision 所需的目标 revision。
- **I14 Clean break 与当前表面：** 只有 `silvermoon.yaml`、`repoledger.yaml`、根目录
  `ideas/` 或 `.repoledger/` 的 fixture 不构成有效 Silvermoon repository，也不会触发旧内容
  读取、合并、移动、删除或迁移。非历史源码、schema、package、skill、README 和当前文档只把
  `.silvermoon/` 三层布局描述为当前 contract；历史 idea 内容保持不变。
- **I15 完整验证：** Deterministic trajectory tests 覆盖 scaffold、三阶段 authoring、
  status-only decision commits、三种回退矩阵、abandonment、criteria evidence、concurrent
  primary movement 和 package smoke install；最终候选通过 `pnpm check` 和
  `git diff --check`。

## Deployment acceptance criteria

- **D01 新仓库 lifecycle：** 从受控 workflow 安装发布候选后，一个只包含
  `.silvermoon/config.yaml` 的全新 fixture repository 能完成 create、ideal approval、
  implementation acceptance、deployment acceptance 和 completed navigation；生成路径与三层
  revision 全部符合本 contract。
- **D02 生产级联验证：** 在已 completed 的已发布 fixture 中分别提交 outer-only、inner-only
  和 ideal change，已安装 CLI 依次报告 deploying、implementing 和 preparing，且未修改
  `status.yaml`、Git refs 或其他 world tree。
- **D03 发布包与 skill：** npm package、Agent skill 和当前用户文档只发现并展示
  `.silvermoon/ideas/<IDEA_ID>/` 三层布局，并能从每个 phase 的 guidance 找到规范入口和同层
  辅助材料范围；它们不依赖开发 checkout、旧品牌文件、根目录 `silvermoon.yaml`、全局
  Repoledger 安装或迁移数据。
