<p align="center">
  <img src="./assets/silvermoon.svg" width="960" alt="Silvermoon，项目之灵">
</p>

<p align="center">
  <a href="./README.md">English</a> | 简体中文
</p>

# Silvermoon（银月）

**The spirit of your project.（项目之灵。）**

> *Silvermoon（银月）得名于《凡人修仙传》（A Record of a Mortal's Journey to
> Immortality，RMJI）中的器灵与坚定同行者。就像她一样，这个 Silvermoon 与项目产物
> 共存，理解它们的状态，并帮助同行者判断下一步：它是你的项目之灵。*

Silvermoon 是人类与 Agent 共享的工具。它检查仓库的真实状态，保存双方都能理解的
事实，守护决策边界，并回答一个问题：**下一步是什么？**

它不是个人助理，也不会替人类作决定。Silvermoon 属于项目本身，因此每位协作者看到的
都是同一份状态和同一个最高优先级的下一步行动。

Silvermoon 有三个公开命令：

```sh
silvermoon whats-next [idea]
silvermoon create-idea
silvermoon check [--remote | --commit <revision> | --staged | --worktree]
```

`whats-next` 会 fetch 并观察，但绝不会编辑、checkout、merge、commit、stash、删除、
reset、fast-forward 或 push；它只返回一个最高优先级行动。`check` 为人类、hook 和
CI 验证存储及 Git 事实。`create-idea` 先执行同样的仓库卫生预检，再创建一个结构化
idea 脚手架；它不会 stage、commit、push 或记录 approval。

## 安装

```sh
npm install --save-dev silvermoon
npx skills add shazhou-ww/silvermoon --skill silvermoon
```

需要 Node.js 22 或更高版本，并且能够通过 Git 访问配置的 primary branch。

## 配置

创建 `.silvermoon/config.yaml`：

```yaml
version: 1
primaryRepository: https://github.com/example/repository.git
primaryBranch: main
```

仓库 URL 是不含凭据的 canonical HTTPS 共享状态。凭据、remote 名称和 URL rewrite
仍属于本地 Git 配置。metadata 路径固定，不能通过配置覆盖。

## 存储 Idea

每个 idea 都放在一个 canonical 大写 ULID 目录中，彼此独立：

```text
.silvermoon/
|-- config.yaml
`-- ideas/
    `-- 01M36QGPNTXEPP61DA4KP4AVZF/
        |-- status.yaml
        |-- ledger.md
        `-- outer/
            |-- Deployment.md
            `-- inner/
                |-- Implementation.md
                `-- ideal/
                    `-- Idea.md
```

三个嵌套世界各有 canonical English name 和中文名称：

- **Ideal World（道心）：** `Idea.md` 定义理想。
- **Inner World（内景）：** `Implementation.md` 定义实现。
- **Outer World（现世）：** `Deployment.md` 定义部署。

道心立意，内景成形，现世验真。

每个世界都可以包含其他文件或目录。Ideal World 的产物服务于 `Idea.md`，Inner World
的产物服务于 `Implementation.md`，Outer World 的产物服务于 `Deployment.md`；
辅助材料永远不能取代同一世界的 canonical 入口。

每个世界都是不透明的 Git tree。`idealRevision` 标识 `ideal/`；`implementationRevision`
标识 `inner/`，因此包含 Ideal World；`deploymentRevision` 标识 `outer/`，因此包含
两个内层世界。由此形成确定性的级联失效。`status.yaml` 和必需的 `ledger.md` 位于
三个世界之外。

Silvermoon Agent skill 在 `Implementation.md` 和 `Deployment.md` 的 `## Steps`
下编写计划，在 `## Acceptance criteria` 下编写结果契约。每项使用稳定的三级标题
`I-Sxx`、`I-ACxx`、`D-Sxx` 或 `D-ACxx`。每条 criterion 同时描述可观察结果和证明
方法。世界契约不使用任务列表 checkbox。

idea 根目录必需的 `ledger.md` 在 Implementation 和 Deployment 的 Steps 与
Acceptance criteria checklist 中镜像稳定 ID 和短标题。Silvermoon 要求它是常规文件，
但不会解析其内容、把它纳入 world revision，或从 `[x]` 推断人类决定。Agent 同步更新
world heading 与 ledger entry；若已完成事项发生实质变化，则重置 checkbox；下一步由
`whats-next`、world contract 和未勾选条目共同决定。

```yaml
version: 1
id: 01M36QGPNTXEPP61DA4KP4AVZF
alias: publish-documentation
approvedRevision: 0123456789abcdef0123456789abcdef01234567
implementationAcceptedRevision: 0123456789abcdef0123456789abcdef01234567
deploymentAcceptedRevision: 0123456789abcdef0123456789abcdef01234567
```

`version` 和 `id` 必填。`alias` 可选；存在时，它是区分大小写、精确且唯一的 selector。
其他可选字段按 canonical 顺序依次为 `abandoned: true` 和上面三个 revision 字段。
显式的 `abandoned: false`、派生 state、criteria mirror、source locator、未知 key、
YAML alias/anchor、comment 以及非 canonical YAML 都会被拒绝。

状态按以下顺序派生：

1. `abandoned: true` 时为 `abandoned`。
2. `approvedRevision` 与 `idealRevision` 不同时为 `preparing`。
3. `implementationAcceptedRevision` 与 `implementationRevision` 不同时为 `implementing`。
4. `deploymentAcceptedRevision` 与 `deploymentRevision` 不同时为 `deploying`。
5. 三个 revision 全部匹配时为 `completed`。

## 导航

```sh
silvermoon whats-next
silvermoon whats-next 01M36QGPNTXEPP61DA4KP4AVZF
silvermoon whats-next publish-documentation --json
```

不提供 selector 时，Silvermoon 会要求你从多个 active idea 中选择一个、继续唯一的
active idea，或创建新 idea。提供 ULID 或精确唯一的 alias 时，它会渲染状态指引。
每次调用都会先检查配置的 primary branch、冲突、dirty worktree 以及本地与远端 primary
的 ancestry。

JSON 报告包含 `observedPrimaryCommit`、`selectedIdea` 和且仅有一个 `action`。后续写入
应把 observed commit 当作预期的远端 tip。如果 primary 已移动，应重新 fetch 并观察，
而不是重放过期决定。

## 创建 Idea

```sh
silvermoon create-idea --json
```

branch、冲突、dirty-worktree 和 primary-ancestry 卫生检查通过后，该命令生成 canonical
ULID、结构化的 `Idea.md`、`Implementation.md`、`Deployment.md`、`ledger.md`，以及只含
`version` 和 `id` 的 canonical `status.yaml`。它不会要求或虚构 alias。新文件有意保持
untracked，因此下一次 `whats-next <ULID>` 会报告 `inspect-worktree-changes`，直到你完成
初始 `Idea.md`、审阅 candidate，并通过普通 Git 发布。Agent 可以根据用户请求添加简洁、
唯一的 alias；用户无需为了命名而停下。

Silvermoon 没有修改 approval 或 acceptance 的命令。收到明确决定后，应编辑 idea 的
status 文件，运行 `silvermoon check --staged`，提交状态事实，再通过普通 Git 非强制 push。

## 验证

- `check` 只验证已提交的 `HEAD` snapshot，并从该 snapshot 读取 primary coordinates。
- `check --worktree` 验证由 HEAD、index、unstaged change 和未忽略 untracked file
  组成的假设 commit，并从这个完整 candidate 读取 primary coordinates。
- `check --staged` 验证 index snapshot。
- `check --commit <revision>` 验证一个本地 commit snapshot。
- `check --remote` 使用已提交 HEAD 的 coordinates fetch primary，验证其 immutable tip，
  并根据完整的、可达的 primary history 证明保留的 revision fact。

这些 target 互斥，也都不会改变调用者的 branch、index 或 worktree。退出状态 `0`
表示成功，`1` 表示验证或操作失败，`2` 表示 CLI 用法无效。使用 `--json` 可获得完整、
稳定的 report envelope。

仓库配置 schema 是 [schema/v1/config.schema.json](schema/v1/config.schema.json)，
idea status schema 是
[schema/v1/idea-status.schema.json](schema/v1/idea-status.schema.json)，二者共用
[schema/v1/definitions.schema.json](schema/v1/definitions.schema.json) 中的定义。

运行时检查还会验证 canonical YAML、固定常规 metadata 路径、三个 world entry、唯一
alias、当前 Git object format、tree object type、逐 world candidate revision binding
和 acceptance history。

## 采用 Silvermoon

Silvermoon 是从上一产品直接进行的不兼容切换。它只识别版本 1 的
`.silvermoon/config.yaml`，不会读取、转换或诊断旧布局。请保留 Git history，并且只记录
有明确 review 支持的 acceptance fact。采用步骤见已安装 skill 的
`references/adoption.md`。

## 开发

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm check:skills
```
