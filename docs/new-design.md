# Repoledger vNext 设计提案

## 背景与设计目标

Repoledger 是面向一般 Git repository 的人机任务协作模型，不依赖 GitHub、Gitea 等具体
托管平台。它把目标、验收结论和项目版本一起保存在 repository 中，解决传统 issue tracker
与 Git 历史分离、任务状态难以跨设备复现以及协作流程依赖托管平台的问题。

vNext 希望进一步收敛这个模型：

- 用一个稳定目录表达一个长期存在的 idea。
- 不存储可推导的 state，只保存最少的事实。
- 以 remote primary 的当前树作为权威观察对象。
- 让 `repoledger whatsnext` 成为人和 Agent 的唯一导航入口。
- 保留 `repoledger check` 作为 hook、CI 和自动化使用的校验入口。
- 所有协作仍由普通 Git commit、fetch、merge 和 push 完成。

## 设计哲学

每个项目都是一台影响世界的机器，repository 是这台机器的驾驶舱。人和 Agent 在驾驶舱
中形成共同认知与共同期待，再通过 repository 的迭代驱动现实变化。

### 世界的三个层面

站在一个项目的视角，可以把相关世界分为三个嵌套层面：

- **客观世界**：项目能影响或会影响项目的现实客体。对于互联网服务，它包括源码、线上
  服务、数据库、用户设备、外部平台以及用户本身。
- **本体世界**：人和 Agent 对项目的共同认知，即 repository 当前内容。代码、文档、配置、
  部署脚本和计划都属于本体世界。GitHub issues、Actions 与 CI runs 等 repository 外对象
  属于客观世界，而不是 Repoledger 的权威状态。
- **理想世界**：人和 Agent 对本体世界及客观世界的共同期待。每个 idea folder 描述一个
  可长期保留、可反复修订的期待；无论尚未开始、正在实施、已经完成还是已经放弃，它都
  是 repository 历史的一部分。

### 改造世界的三个阶段

人和 Agent 通过三个阶段改变世界：

1. **探讨目标（想）**：观察现实、讨论目标和边界，修改 idea 定义。
2. **本体迭代（知）**：根据已认可的 idea 修改 repository deliverable。
3. **驱动客体（行）**：根据 repository 当前内容操作外部世界，例如发布文档、更新系统、
   部署服务或执行人工检查。

三个阶段对应派生状态 `preparing`、`implementing` 和 `deploying`。完成与放弃分别派生为
`completed` 和 `abandoned`。

状态可以因 idea 内容变化而回到前一阶段，但历史和已经发生的外部副作用不会被抹去。
这里的 Gravity 不是阶段只能单向移动，而是：对任意一个已观察状态，当前 Agent session
都应得到一个唯一优先的下一方向。

## Repository 模型

### Layout

默认使用 `ideas` 目录；项目可在 `repoledger.yaml` 中覆盖该路径。

```text
/
|-- repoledger.yaml
`-- ideas/
    |-- 01M36QGPNTXEPP61DA4KP4AVZF/
    |   |-- Idea.md
    |   `-- ...
    |-- 01M36QGPNTXEPP61DA4KP4AVZF.status.yaml
    |-- 01M36QGPQ4H3R0K4N7Y6W2S8JCT/
    |   `-- Idea.md
    `-- 01M36QGPQ4H3R0K4N7Y6W2S8JCT.status.yaml
```

Idea folder 与 status 文件是 sibling，而不是父子关系：

- `ideas/<ULID>/` 只保存理想定义，包括 `Idea.md` 与其他共同期待文档。
- `ideas/<ULID>.status.yaml` 保存不可从 idea 内容本身推导的最少事实。
- `Progress.md` 不放在 idea folder 中。进展首先由 Git history 与 acceptance commits 表达；
  若未来确需独立日志，应放在不参与 idea revision 的位置。

这个布局既避免所有 idea 共同写一个中央 status 文件，也避免 status 更新改变 idea 内容
revision。

### Idea identity 与 alias

每个 idea 使用 26 字符、Crockford Base32 编码的 ULID 作为 canonical identity。Folder 和
status 文件名都使用这个 ULID；idea 改名、repurpose 或跨设备同步时 identity 不变。

Status 文件保存可变 alias，供人阅读和命令选择：

- ULID 始终唯一且优先作为精确选择参数。
- Alias 在当前 primary 中必须唯一；重复 alias 是结构错误。
- 修改 alias 不改变 idea revision，也不使任何 acceptance 失效。
- Status 内的 `id` 必须与 folder 和 status 文件名一致，便于检测误移动或复制。

### Idea revision

Idea revision 不使用自定义文本 hash，也不使用整个 primary commit ID。它直接使用 Git 对
`ideas/<ULID>/` 目录计算的 tree object ID：

```sh
git rev-parse <primary-commit>:ideas/<ULID>
```

本文将该值记作 `ideaRevision`。它具有以下性质：

- 只取决于 idea folder 的路径、文件 mode 和内容。
- 不受 sibling status 更新、alias 修改或其他 idea 变化影响。
- 使用 repository 当前 object format，不把 SHA-1 或 SHA-256 写死进协议名称。
- Idea folder 中任意内容变化都会生成新的 revision，并使绑定旧 revision 的 acceptance
  自动失效。
- 每个 revision 字段必须解析为 Git tree object，而不能只是长度合法的 commit/blob OID。

因为 idea folder 只描述理想定义，所以这种“任何定义变化都保守地重新确认全部阶段”的
策略是 vNext 的明确取舍。若未来需要只让部分变化失效，可以再定义分阶段 projection；
vNext 首版不引入这层复杂度。

### Per-idea status

Status 不保存显式 state，也不保存 criteria 列表或每条 criteria 的 accepted 状态。最小结构
如下：

```yaml
version: 1
id: 01M36QGPNTXEPP61DA4KP4AVZF
alias: publish-documentation
abandoned: true
approvedRevision: <git-tree-oid>
implementationAcceptedRevision: <git-tree-oid>
deploymentAcceptedRevision: <git-tree-oid>
```

除 `version`、`id` 和 `alias` 外，其余字段均可缺省：

- `abandoned: true` 表示当前 abandonment decision；false 使用字段缺省表达。
- `approvedRevision` 表示用户认可过的 idea revision。
- `implementationAcceptedRevision` 表示 Agent 或用户已针对该 idea revision 完成本体迭代验收。
- `deploymentAcceptedRevision` 表示 Agent 或用户已针对该 idea revision 完成驱动客体验收。

Criteria 可以写在 `Idea.md` 或 idea folder 的其他定义文档中，供 Agent 判断阶段是否完成；
它们不是 work items，也不在 status 中逐项镜像。是否存在 implementation criteria 或
deployment criteria 不参与状态推导。即使某阶段没有额外工作，Agent 也仍需检查并明确接受
该阶段，只是 acceptance 可以立即完成。

Criteria 是人和 Agent 的语义判断依据，不是 `repoledger check` 能证明为真的机器谓词。
`check` 只验证结构、revision binding 和 Git 历史；是否已经满足 idea 中描述的期待，由
Agent 或用户在写入整体 acceptance 前负责判断。

### 纯状态推导

所有状态都从 remote primary 当前的 idea tree 和 status 文件纯推导：

```ts
function deriveIdeaState(
  ideaRevision: GitObjectId,
  status: IdeaStatus,
): IdeaState {
  if (status.abandoned) {
    return "abandoned";
  } else if (status.approvedRevision !== ideaRevision) {
    return "preparing";
  } else if (status.implementationAcceptedRevision !== ideaRevision) {
    return "implementing";
  } else if (status.deploymentAcceptedRevision !== ideaRevision) {
    return "deploying";
  } else {
    return "completed";
  }
}
```

这是一条完整、互斥且有序的 `if / else if / ... / else` 链：

1. `abandoned` 始终最高优先。
2. 计划未认可或 idea 内容已变化时进入 `preparing`。
3. 当前 idea revision 尚未完成本体迭代验收时进入 `implementing`。
4. 当前 idea revision 尚未完成驱动客体验收时进入 `deploying`。
5. 三个 revision 全部匹配时进入 `completed`。

没有额外的 `terminated` state；`completed` 与 `abandoned` 是两个独立派生值。

### Revision acceptance 语义

Revision 字段记录历史事实，不需要在 idea 内容改变时清理：

- Idea folder 改变后，三个旧 revision 自然都不匹配，state 回到 `preparing`。
- 用户认可新 revision 后，只更新 `approvedRevision`；旧 implementation/deployment revision
  仍保留，但因不匹配而自然失效。
- 本体迭代验收完成后，更新 `implementationAcceptedRevision`。
- 驱动客体验收完成后，更新 `deploymentAcceptedRevision`。
- 设置 `abandoned: true` 会覆盖其他推导结果。
- 清除 `abandoned` 不清理三个 revision；它只表达用户撤回 abandonment decision，state
  随即按当前 idea revision 与历史 acceptance 重新推导。

正常 acceptance 使用单独的 status-only commit。新写入的 revision 必须等于该 commit 中
idea folder 的 tree OID。Status 位于 folder 外，因此不会产生 hash 自引用。

对于 status 中当前保留的每个 revision，remote history check 沿 primary history 找到该值
首次写入对应字段的 status commit，并验证那个 commit 中 `ideas/<ULID>/` 的 tree OID 正好
等于该值。这样不需要额外保存 evidence commit，Git history 本身就是 acceptance 事件。
Shallow 或缺失必要历史时，完整 remote check 应要求补齐历史，而不是把任意 tree OID 当成
合法 acceptance。

如果修改 idea 定义的同时已经取得用户对新定义的明确认可，也可以在同一个 candidate tree
中计算 idea subtree OID，并在同一 commit 更新 `approvedRevision`；validator 仍能直接比较
status 值与 candidate tree。普通 Agent 流程应优先使用独立 approval commit，便于审计。

### 外部世界的不完美

`deploymentAcceptedRevision` 是一次有时间边界的判断：它表示在 acceptance commit 发生时，
人或 Agent 认为该 idea revision 的驱动客体条件已经满足。它不表示外部世界从此永远保持
该状态。

Repoledger 不持续监控现实，也无法把现实暂停后做原子验收。现实后来发生漂移时，需要人或
Agent 更新 idea 定义或重新记录 acceptance；Git history 保存每次判断发生时的 repository
版本与时间。这是模型明确接受的最终一致性边界。

## Git 与协作模型

### Primary authority

每个项目配置一个 canonical primary repository URL 和 primary branch。所有 idea 内容、
status 与派生状态都以一次成功 refresh 得到的不可变 primary tip commit 为权威。本文将它
称为 `observedPrimaryCommit`；一次 `whatsnext` 的结构检查、revision 计算、状态派生和输出
全部绑定同一个 commit，而不是声称观察到会永久保持“最新”的 branch。

`whatsnext` 可以在不修改 checkout 的情况下 fetch 并观察 primary。Local worktree 与 primary
不一致时，提示优先处理同步问题；它不会拿 stale local state 冒充项目状态。输出应包含
`observedPrimaryCommit`，后续任何写入都必须以它作为 expected-tip CAS；若 primary 已推进，
写入失败并重新 fetch、派生和生成 guidance。

### Local working branch

vNext 不要求每个 idea 拥有或发布专用 feature branch。默认协作方式是：

- 当前 clone 的 configured primary branch 是工作分支。
- 一个 Agent session 的 worktree 同时只处理一个 selected idea。
- Idea 绑定存在于当前 Agent session 上下文，不写入 status 或 worktree-local marker。
- Commit 可以带 idea ULID trailer 以改善审计，但首版不强制。

这是一项主动取舍：没有 mandatory branch 或 trailer 时，CI 无法从历史 commit 证明每项
deliverable change 属于哪个 idea，也无法硬性重建“该 commit 当时由哪个 idea 驱动”。
Preparing/deploying 的路径限制因此主要是 `whatsnext` 对当前 worktree 的实时协作纪律，而
不是跨历史的强制归属不变量。

### 可选 feature branch

人或 Agent 可以使用 feature branch 传输未完成工作、跨设备续作或协调并行开发，但它不是
Repoledger 协议状态：

- Status 不记录 feature branch。
- `whatsnext` 不依赖 feature branch 存在。
- 进入正式状态推导与 acceptance 前，相关工作应通过普通 Git 流程进入 local primary 并
  最终进入 remote primary。
- Branch 的创建、命名、发布和清理由人和 Agent 协调。

### 并发与冲突

Per-idea status 文件避免不同 idea 更新同一个中央 ledger。不同设备或 Agent 的并发修改仍按
普通 Git 规则处理：fetch、merge、解决冲突、验证、非强推 push。

“一个 worktree 同时处理一个 idea”不是 repository 可证明的锁。需要强隔离时，人可以使用
不同 clone 或 worktree/branch；Repoledger 首版不引入全局锁服务。

## `repoledger whatsnext`

`repoledger whatsnext` 是面向人和 Agent 的核心产品入口。Gravity 的“唯一方向”指一个 Agent
session 在当前 observation 下只获得一个最高优先级动作，不表示整个项目同时只能有一个
idea。

### 不指定 idea

命令从 remote primary 扫描并验证所有 idea/status pairs，然后派生每个 idea 的 state：

```text
primaryRefreshFailed: 输出网络、鉴权或 branch 缺失诊断；不使用 stale local ref 派生项目方向。
projectStructureInvalid: 输出结构诊断和修复要求。
hasMultipleActiveIdeas: 列出 preparing/implementing/deploying ideas，使用 ULID 与 alias 输出选择提示。
hasSingleActiveIdea: 提示选择并继续该 idea。
hasNoActiveIdea: 提示与用户探讨并创建一个新 idea。
otherwise: 报告无法解释的项目状态并停止。
```

选择是该 session 在这一刻唯一的方向。`completed` 和 `abandoned` 默认不进入 active selection，
但始终可以通过 ULID 或唯一 alias 显式查询。

### 指定 idea：worktree 卫生优先

命令先从 remote primary 取得 canonical idea snapshot，再观察当前 worktree：

```text
primaryRefreshFailed: 输出网络、鉴权或 branch 缺失诊断；不读取 stale primary snapshot。
ideaStructureInvalid: 输出该 idea 的 folder/status/schema 诊断。
worktreeNotOnConfiguredPrimary: 当前 HEAD 不是 symbolic ref `refs/heads/<configured-primary-branch>`；提示先保存当前工作，再切换或把可选 feature branch 工作整合到 configured primary。
worktreeHasConflicts: 提示在不丢弃任一侧的前提下解决冲突，然后重新询问 whatsnext。
worktreeHasChanges: 提示 Agent 读取精确 diff；当前 idea 必要工作应提交，来源明确的临时产物可精确删除，未知或其他工作应保留并使用有说明的 stash、其他 worktree 或明确路径决定处理。
localPrimaryBehindRemote: 提示在 clean worktree 上执行 ff-only 同步，然后重新观察。
localPrimaryDivergedFromRemote: 提示保留双方历史并执行普通非强推整合，解决冲突后重新观察。
localPrimaryAheadOfRemote: 提示运行 check，并以 expected remote tip 非强推发布 primary。
otherwise: 根据 remote primary 中的派生 idea state 输出 state guidance。
```

Dirty、behind 或 diverged 不会让 `whatsnext` 无法回答；它们只是比 idea phase work 更高优先级
的提示。未知变更绝不因 Agent 主观认为“无关”而自动丢弃。

### 指定 idea：state guidance

```text
ideaIsAbandoned: 报告 abandonment 与 idea 历史，询问保持 abandoned、清除 abandonment 或创建新 idea。
ideaIsPreparing: 聚焦 idea folder，与用户讨论清楚目标、设计、边界和三个阶段的完成判断；提交理想定义，并在用户明确认可当前 ideaRevision 后更新 approvedRevision。
ideaIsImplementing: 根据当前 idea definition 修改 repository；检查本体迭代是否满足全部期待，完成后把 implementationAcceptedRevision 更新为当前 ideaRevision。
ideaIsDeploying: 不修改 repository deliverable；根据当前 repository 驱动外部世界并检查结果，完成后把 deploymentAcceptedRevision 更新为当前 ideaRevision。若发现需要改变理想定义，先更新 idea 并重新取得 approval。
otherwise: state 为 completed；报告已完成 idea 和 acceptance 历史，询问是否修改该 idea 或创建新 idea。
```

`whatsnext` 输出指导，不直接修改文件、commit、merge 或 push。Agent 执行提示造成 repository
变化后，再次调用 `whatsnext` 获得下一方向。

## Status mutation 与审计

vNext 不要求公开大量 lifecycle 子命令。Agent 根据明确 human decision 或阶段检查结果修改
对应 status 字段，并用普通 Git commit 发布。

推荐每个 approval/acceptance/abandonment 变化使用只修改该 idea status 的独立 commit：

- Commit author 和 timestamp 提供“谁在何时记录了这个判断”的 Git 审计事实。
- Repoledger 不声称 Git author 能密码学证明实际 human decision maker。
- Commit parent 表示做出判断时的 repository snapshot。
- 旧 revision 字段可以保留；它们是历史 acceptance，不匹配当前 tree 时不会影响派生状态。

所有 status publication 都使用 `observedPrimaryCommit` 做 compare-and-swap，并通过普通
non-force push 发布。CAS 失败时不得 rebase 一个已经过期的判断后继续提交；必须 refresh
primary，重新计算 ideaRevision、derived state 与 guidance，再决定是否仍应写入。

如果 deploying 中发现问题并修改 idea 定义，新的 tree OID 会自动使全部旧 acceptance 失效。
在获得新 approval 后，状态自然进入 implementing；不需要级联清理 status 字段。

## 校验与命令面

### 产品入口

面向人和 Agent 的核心导航命令只有：

```sh
repoledger whatsnext [idea]
```

### 自动化入口

Hook、CI 和高级自动化仍需要结构化校验：

```sh
repoledger check
```

内部实现保持可复用的四层职责：

```text
observe -> derive -> validate -> render
```

`check` 至少验证：

- `repoledger.yaml` 与 ideas directory 安全性。
- ULID folder 与 sibling status 一一对应，无 orphan 或重复 identity。
- Status schema、字段顺序与 canonical serialization。
- Status `id` 与文件名/folder 一致。
- Alias 是 1 到 120 个字符的单行、trimmed UTF-8 文本，不包含 control characters；比较
  采用精确、case-sensitive 语义，并在 observed primary 中保持唯一。
- `abandoned: false` 不是 canonical 表达；false 必须通过字段缺省表示。
- Revision 字段使用当前 repository object format、解析为 tree object，并能从 primary
  history 找到将该值合法绑定到该 idea folder tree 的 status commit。
- 新写入的 approval/acceptance revision 等于对应 candidate 中的 current ideaRevision。
- 禁止 status 文件包含显式派生 state、criteria 列表或逐项 acceptance 状态。
- Ideas root、idea folder 和 status 均为 repository-owned regular directory/file；拒绝
  symlink、case-colliding ULID、嵌套 status、特殊文件和越出 repository root 的路径。

本地 hook 提供早期反馈，required CI 与 branch protection 才是 primary 的最终 enforcement
boundary。Repoledger 不依赖某个托管平台，但可以利用平台提供的通用 Git/CI 能力。

### 克制的命令设计

`whatsnext` 是产品核心，`check` 是必要 plumbing。初始化、迁移或诊断辅助命令只有在无法用
安全、明确的普通 Git 操作表达时才增加；不重新扩张成一组要求人记忆的 lifecycle commands。

## 一致性与明确取舍

- State 是纯派生视图，不写入 status。
- `completed` 与 `abandoned` 是两个不同的 terminal 派生值；两者互斥，且 `abandoned` 在
  推导链中具有最高优先级，不再组合成 `terminated + flag` 对外表示。
- Impl/deploy criteria 的存在性不参与状态推导，也不写入 status。
- 每个最终达到 `completed` 的 idea 都经过 plan approval、implementation acceptance 和
  deployment acceptance；没有额外工作的阶段可以立即接受，abandoned idea 无此要求。
- Idea folder 的任何变化都保守地使三个旧 revision 失效。
- 清除 `abandoned` 不清理 acceptance；它只撤回 abandonment decision。
- External acceptance 是某一 Git 时刻的判断，不是对现实世界永久成立的证明。
- 单 main、无 mandatory branch/trailer 简化了跨设备模型，但主动放弃 per-idea commit attribution
  与历史 phase enforcement。
- Per-idea status、ULID identity 和纯 Git history 提供平台无关的合并与审计基础。

## 与当前版本的关系

这是对现有 task/status/source-branch 模型的 breaking redesign，应使用新的 storage schema
version，而不是把旧文件静默解释为新格式。

迁移至少需要：

- 为每个现有 task 分配稳定 ULID。
- 把 task contract 转换为 idea definition。
- 把完成、放弃与当前执行事实转换为 revision acceptance 或 abandonment。
- 处理旧 source branch 中尚未进入 primary 的工作。
- 在迁移前后分别运行结构校验，且保留旧 Git history。

具体 schema 版本、Idea.md 的最小章节、迁移命令与 backward-compatibility 窗口留待实现设计。