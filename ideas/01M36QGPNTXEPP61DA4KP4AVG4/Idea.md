# 加固 Repoledger vNext 的校验与导航边界

Created: 2026-09-24
Language: zh-CN

## Goal

修复 vNext code review 中确认的五项边界问题，使 acceptance revision 在所有 Git candidate
形态下都被一致校验，使 `whatsnext` 在创建 idea 前仍遵守 worktree hygiene，使 primary
authority 切换具有明确语义，并让公开 API、runtime 与 JSON Schema 对 object ID 和 layout
使用同一契约。

## Context

Repoledger `0.9.1` 已实现 content-addressed ideas、纯状态推导、只读 `whatsnext` 和 v3
checker，完整 `pnpm check` 通过。进一步使用临时 Git repository 探测未覆盖边界时，确认
现有自动化测试没有覆盖 root commit、project-level create guidance、primary relocation、
无 repository context 的公开 helper，以及 nested status 等场景。

以下复现均针对 commit `768b68ddf323082bd248b6921d9c39080fb20f2c`，在临时目录中完成，
不会修改被审阅 repository。

## Issue 1：Root commit 可绕过 acceptance candidate binding

### Impact

`repoledger check --commit HEAD` 是文档建议的 CI candidate check。Root commit 没有 first
parent，当前实现因而跳过 candidate revision validation；一个错误 acceptance 可以进入
primary，后续普通 commit check 也会因字段未变化而继续跳过，只到完整 remote history check
时才暴露问题。

### Preconditions

- 一个全新的 Git repository，当前尚无 commit。
- 有效的 v3 `repoledger.yaml`。
- 一个合法 ULID idea folder 与 sibling status。
- 一个存在于 object database、但不是该 idea folder tree 的 tree OID，例如空 tree。

### Reproduction

1. 初始化 `main` 分支和 Git identity。
2. 创建 `ideas/<ULID>/Idea.md`。
3. 生成一个无关但有效的 tree OID，并将其写入 sibling status 的 `approvedRevision`。
4. 把配置、idea 与 status 一起提交为 repository 的 root commit。
5. 运行：

   ```sh
   repoledger check --commit HEAD --json
   ```

### Actual

命令返回 exit code `0`、`ok: true`、空 diagnostics。已复现的 idea tree 为
`f0bd7cf2...`，错误 `approvedRevision` 为 empty tree `4b825dc6...`。

### Expected

Root commit 中每个新出现的 acceptance revision 都应视为相对“空 previous status”的新增
字段，并必须等于同一 candidate snapshot 中的 current idea tree。上述 candidate 应返回
`idea.revision.candidate-mismatch`。

### Likely surface

- `src/index.js` 的 commit target 在 root commit 时没有 parent/base revision。
- `src/idea-layout.js` 只在存在 `baseRevision` 时调用 candidate revision validation。

## Issue 2：无 active idea 时 create guidance 跳过 worktree hygiene

### Impact

当项目没有 active idea 时，无参数 `whatsnext` 会直接提示创建 idea。当前路径不检查 branch、
conflict、dirty worktree 或 local/remote primary relation，Agent 可能在 feature branch、脏
worktree 或落后的 primary 上创建第一个新 idea。

### Preconditions

- 有效 v3 repository 与 remote primary。
- 所有现有 idea 均为 `completed` 或 `abandoned`，或者 repository 没有 idea。
- Local worktree 位于 `feature` branch，并有未提交文件 `dirty.txt`。

### Reproduction

1. 从 synchronized `main` 创建并切换到 `feature`。
2. 创建未提交的 `dirty.txt`。
3. 运行：

   ```sh
   repoledger whatsnext --json
   ```

### Actual

命令返回 `ok: true`、`selectedIdea: null` 和 action `create-idea`，没有
`switch-to-primary` 或 `inspect-worktree-changes` guidance。

### Expected

`create-idea` 是会引发 repository mutation 的产品动作。无 active idea 时也必须先经过与
selected idea 相同的 branch/conflict/dirty/primary reconciliation；只有 clean、synchronized
configured primary 才能输出 `create-idea`。

### Likely surface

- `src/whatsnext.js` 的 no-selector 分支在调用 `worktreeAction` 前直接返回 `create-idea`。

## Issue 3：Primary config relocation 产生 authority 不一致

### Impact

命令使用 local checkout 中的旧 config 决定从 primary A fetch，随后读取 A 的新 tip；如果该
tip 已把 `primaryRepository` 改成 B，当前实现仍把 A 的 commit 与 ideas 作为 observed authority，
却把 snapshot 中的 config 当作 B。输出混合了两个 primary identity，下一次运行又可能突然
跳到 B，缺少可审计 handoff。

### Preconditions

- 两个不同 bare repositories A 与 B。
- Local clone L 停在 A0，A0 的 config 指向 A。
- 另一 clone 向 A 发布 A1，A1 的 config 改为指向 B。
- B 有不同的 B0 idea snapshot。
- L 不 pull A1，因此本地 config 仍指向 A。

### Reproduction

1. 在 L 中配置 A/B canonical URL 到两个 bare repository 的本地 URL rewrite。
2. 从另一 clone 向 A 发布 A1，仅把 authoritative config 改为 B，并保留可区分的 A-side idea。
3. 在 B 发布内容不同的 B0。
4. 从仍停在 A0 的 L 运行：

   ```sh
   repoledger whatsnext <idea> --json
   repoledger check --remote --json
   ```

### Actual

两条命令都成功且没有 diagnostics；它们使用 L 的旧 config fetch A，报告 A1 为
`observedPrimaryCommit`/remote commit，并读取 A1 的 idea，即使 A1 内的 config 声明 B 才是
primary。已复现输出 alias 为 `from-A-migrated`，没有读取 B0。

### Expected

必须明确选择一种一致语义：

- 首版不支持 relocation：local bootstrap config 与 fetched snapshot 的 primary coordinates
  不一致时返回 `config.primary-mismatch`，要求同步后重新观察；或
- 设计显式 handoff：验证 A1 到 B 的连续性，再以 B 的不可变 tip 重新完成 observation。

不得在同一个成功 report 中混用 A 的 commit/ideas 与声明 B 的 authoritative config。

### Likely surface

- `src/whatsnext.js` 与 `src/index.js` 使用 local config fetch 后，没有比较 local/fetched
  primary coordinates，也没有执行受约束 handoff。

## Issue 4：公开 helper 接受 schema-invalid object ID

### Impact

Runtime layout 在有 repository context 时按当前 object format 校验 OID 长度，但 package 公开
导出的 `serializeIdeaStatus`、`validateIdeaStatus` 和 `deriveIdeaState` 在没有内部
`objectIdLength` option 时接受任意长度的小写十六进制。API consumer 可以生成 schema 与
Repoledger runtime 随后拒绝的 status。

### Reproduction

在 repository root 运行：

```sh
node --input-type=module -e "
  import { deriveIdeaState, serializeIdeaStatus } from './src/index.js';
  const id = '01M36QGPNTXEPP61DA4KP4AVZF';
  const status = {
    version: 1,
    id,
    alias: 'x',
    approvedRevision: 'a',
    implementationAcceptedRevision: 'a',
    deploymentAcceptedRevision: 'a'
  };
  console.log(deriveIdeaState('a', status));
  console.log(serializeIdeaStatus(status));
"
```

### Actual

`deriveIdeaState` 返回 `completed`，`serializeIdeaStatus` 输出三个值均为 `a` 的 canonical
YAML。

### Expected

无 repository context 的公开 helper 至少只接受 schema 允许的 40 或 64 位 lowercase hex
OID；有 repository context 时再收紧为当前 object format 的精确长度。公开 serializer 不应
生成 `schema/v3.json` 明确拒绝的文件。

### Likely surface

- `src/ideas.js` 的基础 `OBJECT_ID` 只验证 lowercase hex；长度仅在显式传入
  `objectIdLength` 时检查。

## Issue 5：Idea folder 内的 nested status 未被拒绝

### Impact

vNext 规范要求 status 只能是 idea folder 的 sibling，并明确拒绝 nested status。当前递归
path validator 把 idea folder 内所有 regular file 都当作定义 artifact，因而接受
`ideas/<ULID>/nested.status.yaml`。这会形成看似机器状态但不被协议解释的文件，并让 layout
约束与文档不一致。

### Reproduction

1. 创建一个合法 v3 repository、idea folder 与 sibling status。
2. 在 idea folder 内创建 regular file：

   ```text
   ideas/<ULID>/nested.status.yaml
   ```

3. Commit 后运行：

   ```sh
   repoledger check --commit HEAD --json
   ```

### Actual

命令返回 exit code `0`、`ok: true`、空 diagnostics。

### Expected

任何 idea folder 内以 `.status.yaml` 结尾的 nested file 都应产生明确 layout diagnostic；
只有 `ideas/<ULID>.status.yaml` 是该 idea 的 status authority。

### Likely surface

- `src/idea-layout.js` 的 recursive owned-directory validator 只拒绝 symlink/special entry，
  没有拒绝 nested status suffix。

## Scope

- 修复以上五项行为，并保持既有 v3 数据模型与公开命令面。
- 为每个复现增加自动化 regression test，测试必须先在修复前失败、修复后通过。
- 保持 `whatsnext` 只读、ordinary non-force publication、unknown work preservation 与
  content-addressed idea state derivation。
- 对 primary relocation 做明确且文档化的产品决定，不保留当前混合 authority 行为。

## Out of scope

- 恢复 v1/v2 runtime compatibility。
- 增加 approval/acceptance mutation command。
- 改变五态推导函数、ULID layout 或 sibling status 模型。
- 强制 feature branch、commit trailer 或 per-idea work lock。
- 把本轮加固扩展成新的托管平台依赖。

## Acceptance criteria

- [ ] Root commit 中新增的每个 acceptance revision 都必须等于同一 candidate snapshot 的
  current idea tree；`check --commit`、default local check 和 required CI 都不能漏检。
- [ ] 无 active idea 时，dirty、conflicted、非 configured-primary、behind、ahead 和 diverged
  worktree 都先输出相应 hygiene/reconciliation guidance，只有安全 worktree 才输出
  `create-idea`。
- [ ] Local bootstrap config 与 fetched primary config 的 authority coordinates 不一致时，
  按获批的 mismatch 或 handoff 语义确定性处理，不返回混合 authority 的成功 report。
- [ ] 公开 `validateIdeaStatus`、`serializeIdeaStatus` 和 `deriveIdeaState` 拒绝非 40/64 位 OID；
  repository-aware validation 继续要求当前 object format 的精确长度和 tree type。
- [ ] Idea folder 内的 nested `.status.yaml` 被 checker 拒绝，diagnostic 指向精确路径并给出
  sibling status 修复方式。
- [ ] 新增测试覆盖五个本文复现，并覆盖相邻合法场景，避免修复破坏 root idea creation、
  project-level selection、正常 config、public helper 与普通 narrative artifact。
- [ ] `pnpm check`、pack contents、installed-package smoke、Markdown links 和 skill validation
  全部通过。

## Constraints

- 所有探针和 regression fixtures 使用临时 repository，不污染真实 worktree 或 remote refs。
- 不通过放宽 schema、关闭 history validation 或删除安全检查来修复问题。
- Unknown/user-authored work 与并发 primary history 始终保留，不使用 force-push、hard reset、
  broad clean 或静默 stash。
- 任何 status write 仍绑定不可变 observed primary 与 current idea revision；并发移动后重新
 观察，不重放 stale acceptance。

## References

- [Repoledger vNext design](../01M36QGPNTXEPP61DA4KP4AVZF/Design.md)
- [Idea layout implementation](../../src/idea-layout.js)
- [Idea model](../../src/ideas.js)
- [Repository checker](../../src/index.js)
- [Whatsnext implementation](../../src/whatsnext.js)
- [Version 3 schema](../../schema/v3.json)