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
