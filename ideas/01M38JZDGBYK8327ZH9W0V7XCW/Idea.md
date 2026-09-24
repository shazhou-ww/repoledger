# 降低 Repoledger 单动作循环的操作摩擦

Created: 2026-09-24
Language: zh-CN

## Goal

在不削弱 `whats-next` 单一最高优先 action、worktree hygiene、不可变 observation 和
non-force publication 边界的前提下，减少 Agent 在真实任务循环中需要自行补全的上下文、
重复检查和命令推断，使“观察、执行一步、重新观察”更明确、更高效且更容易被自动评估。

## Context

在完成 `vnext-review-hardening-fixes` 的真实 loop 中，Repoledger 成功阻止了跳过 dirty
worktree、publication 和 acceptance 顺序，也让 implementation/deployment status 分别成为
独立、可审计的 commit。与此同时，实际操作暴露了以下摩擦：

- `inspect-worktree-changes` 只返回 porcelain 文本。Agent 仍需另行读取 staged、unstaged、
  untracked diff，判断哪些变化属于当前动作，哪些属于未知工作。
- Hygiene action 会把 `selectedIdea` 置空。即使调用者明确传入 selector，报告也没有独立字段
  保留 requested idea，跨回合执行者必须自行记忆任务上下文。
- `publish-primary` 给出 commit 与 expected remote tip，但没有结构化给出 validation target、
  canonical repository、branch 或建议命令边界，Agent 需要从 config 和文档重新拼装安全操作。
- 明确要求创建新 idea 时，无 selector 调用仍会优先返回已有的 unrelated active idea；调用者
  必须知道从刚完成 idea 的 `review-completed` 路径表达创建意图，当前 contract 不直观。
- Idea scaffold 仍由 Agent 手工生成 ULID、folder、`Idea.md` 和 sibling status。本 idea 自身
  首次创建时就因 status 缺少 canonical final newline 被 `check --worktree` 拒绝；checker 正确
  阻止了错误，但这类协议机械细节不应由每个 Agent 重复实现。当前 status 又强制要求 alias，
  迫使调用者在理想内容尚为空时发明一个持久名称。
- Immutable snapshot 检查和频繁 re-observation 会反复创建临时 Git worktree。在 Windows
  fixture 中，单个 checker 测试文件约需 39 秒，影响开发反馈速度和 Agent loop 成本。
- 本次实现首次发布后才发现 acceptance criteria 中缺少显式 `--worktree` regression assertion，
  因而多走了一轮 commit、publish 和 re-observe。Loop 安全地容纳了补救，但 skill 没有在首次
  publication 前明确要求逐条完成 criteria-to-evidence audit。

这些问题不是取消 gate 的理由。目标是让 action 携带足够的机器可读上下文、让 intent 有明确
表达方式，并优化 snapshot 实现，使 Agent 更少依赖隐式记忆和临场推断。

## Command naming decision

公开命令采用 `repoledger create-idea` 和 `repoledger whats-next`：

- `create-idea` 是完整、明确的 imperative，与现有 action code 同名，也直接说明会产生本地
  mutation；不采用语义不完整的 `new`、`newidea` 或 `new-idea`。
- `whats-next` 明确保留两个英文词的边界，并与 `create-idea` 统一使用 kebab-case。项目仍在开发
  阶段，不为旧拼写 `whatsnext` 保留 alias、warning period 或 compatibility shim。
- 如果未来出现多个 idea mutation command，可在一次独立设计中整体评估
  `repoledger idea create` / `repoledger idea next`；本 idea 不提前引入只有一个子命令的 group。

## Scope

- 新增 `repoledger create-idea`，把“创建新 idea”变成明确 intent。它复用 `whats-next` 的 primary
  observation 与全局 hygiene；即使存在 unrelated active idea，clean、synchronized primary 上
  也执行 scaffold，而 branch、conflict、dirty、behind、ahead 或 diverged 状态仍先返回唯一
  blocking guidance，不产生部分文件。
- 命令生成 canonical ULID，并创建空的 `ideas/<ULID>/Idea.md` 与 sibling status。空
  `Idea.md` 只让 Git 能表示 idea tree，不填标题、goal、criteria 或其他实质内容。
- 将 status `alias` 从 required 放宽为 optional。`create-idea` 不要求 alias；可选 alias 仍保持
  exact、unique selector 语义，所有无 alias 的 human/JSON rendering 和 selector path 使用 ULID。
- 为 navigation/preflight invocation 建立明确的 request context，至少区分无选择导航、指定
  idea 和 create-idea intent，同时保持每份 report 只有一个可执行 action。
- 在 hygiene 阻挡后续 idea action 时保留 requested context，但不得把未经当前 primary 验证的
  selector 表述为已选中、已批准或可执行的 idea。
- 将 worktree change guidance 从原始 porcelain 字符串提升为稳定的结构化 details，区分
  staged、unstaged、untracked、conflicted 与 rename 信息；不得猜测文件归属或自动处置变化。
- 为 publication guidance 提供执行安全步骤所需的结构化坐标，包括 immutable local commit、
  expected remote tip、canonical repository、branch 和应运行的 commit validation target。
- 在 skill 中加入 publication 前的 criteria-to-evidence audit，要求逐条确认当前 revision 的
  implementation acceptance criteria 已有对应测试、检查或可审计证据。
- 评估并减少只读 observation/check 对临时 Git worktree 的依赖。优先使用 Git object、tree、
  temporary index 或只读 snapshot abstraction，并保持 symlink、object format、untracked file、
  candidate binding 和 history validation 语义不变。
- 增加确定性 trajectory-style 测试，覆盖明确 create intent、unrelated active idea、hygiene
  context retention、structured change guidance、safe publication details 和 primary relocation。
- 更新 README、Repoledger skill 与 adoption guidance，使人和 Agent 对 request、selected idea、
  blocking action 和 publication contract 的含义一致。

## Out of scope

- 让 `whats-next` 自动 checkout、merge、stage、commit、stash、push 或修改 status。
- 让 `create-idea` 填写 idea 的实质内容、stage、commit、push、记录 approval/acceptance，或修改
  已存在的 idea。命令只创建自己的空 scaffold。
- 引入隐藏 session state、server-side lease、work lock 或依赖特定 IDE conversation history。
- 自动判断 dirty path 属于 Agent、用户或其他并发工作。
- 返回多个同等可执行 action，或允许调用者绕过 conflict、dirty worktree、branch 和 ancestry
  hygiene 直接进入 idea mutation。
- 除将 alias 从 required 放宽为 optional 外，改变五态推导、ideaRevision、sibling status 的
  revision fields 或显式 approval/acceptance 事实模型。
- 在本 idea 内实现完整 Agent session eval harness；可复用其未来产物，但生产 contract 与
  deterministic tests 必须独立成立。

## Implementation acceptance criteria

- **I01 CLI surface:** `repoledger --help` 只列出 `check`、`create-idea` 和 `whats-next` 三个
  subcommand。CLI test 断言精确 command set；`whats-next --json` 的 report command 恰为
  `whats-next`。调用 `whatsnext`、`new`、`newidea` 或 `new-idea` 均返回 usage exit code `2`，且
  `git status --porcelain=v1` 前后完全相同。
- **I02 Scaffold bytes:** 在 clean、synchronized configured primary fixture 中运行无参数
  `repoledger create-idea --json` 返回 exit code `0`。`result.createdIdea.id` 匹配 canonical ULID
  regex，`ideaPath` 和 `statusPath` 分别等于 configured ideas directory 下的 `<id>/` 与
  `<id>.status.yaml`；`Idea.md` 恰为 0 bytes，status bytes 恰为
  `version: 1\nid: <id>\n`。除这两个 untracked path 外，fixture 无其他文件、index、HEAD 或 ref
  变化；即 before/after worktree manifest 的差集恰为这两个 path，index tree、HEAD、local refs
  和 remote refs 完全相同。
- **I03 Optional alias:** JSON Schema、`parseIdeaStatus`、`validateIdeaStatus` 和
  `serializeIdeaStatus` 的 tests 分别接受仅含 `version`/`id` 的 status，以及额外含合法 alias 的
  status。无 alias summary 的 JSON 省略 `alias` key，human output 不渲染空括号；ULID selector
  成功。在只含该无 alias idea 的 fixture 中，selector `missing-alias` 返回 `idea.not-found`。在另
  一 fixture 中，两个 status 使用 alias `duplicate` 时产生 `idea.alias.duplicate`。
- **I04 Exclusive creation:** 测试注入的 ULID generator 第一次返回已有 identity、第二次返回新
  identity 时，命令创建并返回第二个 identity，已有 folder/status bytes 不变。注入 status write
  failure（包括 partial sibling write）时命令返回 exit code `1`，删除且仅删除本次调用创建的
  status、空 `Idea.md` 和 folder；before manifest 中每个预先存在 path 的 SHA-256 与 after manifest
  完全相同，after manifest 不含失败 identity 的任何 path。
- **I05 Hygiene matrix:** Table-driven tests 分别构造 wrong branch、conflict、dirty、behind、ahead 和
  diverged fixture。`create-idea --json` 依次返回 `switch-to-primary`、`resolve-conflicts`、
  `inspect-worktree-changes`、`fast-forward-primary`、`publish-primary` 和 `integrate-primary`；每个
  fixture 的 recursive path/SHA-256 manifest、index tree、HEAD、local refs 和 remote refs 前后
  完全相同，且不存在新 ULID path。相同 primary 中即使已有 unrelated active idea，clean/
  synchronized fixture 仍成功创建 scaffold；无 intent 的 `whats-next` 仍返回该 active idea 的
  `continue-active-idea`。
- **I06 Post-create loop:** 成功创建不调用 Git stage、commit、push 或第二次 observation。紧接着运行
  `whats-next <ULID>` 必须因两个 untracked path 返回 `inspect-worktree-changes`，并保留 requested
  ULID；通过普通 Git 提交并发布 scaffold 后再次运行，返回该 ULID 的 `prepare-idea`。
- **I07 Request context:** `whats-next --json` 与 `create-idea` preflight 的每个 result 都包含且只包含
  以下 request shape 之一：`{ kind: "navigate" }`、
  `{ kind: "select-idea", selector: <exact input> }` 或 `{ kind: "create-idea" }`。Known-dirty、
  unknown-dirty、known-wrong-branch 和 unknown-wrong-branch 四个 fixtures 均断言 request 原样保留、
  `selectedIdea: null` 且 report 只有一个 hygiene action；对应 clean fixtures 才分别得到 selected
  idea 或 `idea.not-found`。
- **I08 Structured changes:** 固定 fixtures 使用 `old.txt -> renamed.txt` staged rename、
  `modified.txt` unstaged modification、`new.txt` untracked file 和独立的 `conflict.txt` both-modified
  conflict。`inspect-worktree-changes.details` 恰有 `staged`、`unstaged`、`untracked`、`conflicted`
  四个 keys；各 array 按 `path` 升序，entries 分别精确为
  `{ path: "renamed.txt", kind: "renamed", originalPath: "old.txt" }`、
  `{ path: "modified.txt", kind: "modified" }`、`{ path: "new.txt" }` 和
  `{ path: "conflict.txt", kind: "both-modified" }`。JSON 不含 raw porcelain string、`owner`、
  `owned` 或其他推测归属字段。
- **I09 Publication coordinates:** ahead fixture 的 `publish-primary.details` 精确包含 config 中的
  canonical `repository`/`branch`、resolved `commit`、fetched `expectedRemoteTip`，以及
  `validation: { target: "commit", revision: <commit> }`。测试直接使用这些字段完成 commit check
  与 ordinary non-force push，不再次读取 config。并发 fixture 在 report 后先把 remote ref 从
  `expectedRemoteTip` 推进到 competing commit，再执行原 push；push exit code 非零，remote ref 保持
  competing commit，且没有 force-push invocation。
- **I10 Criteria evidence gate:** 可见、非 idea-tree 的 verification artifact 包含
  `criteriaEvidence` array，并按当前 Idea.md implementation criteria 顺序为每条保存
  `{ criterion: <I01-I14 id>, evidence: [{ type: "test" | "check" | "artifact", locator: <nonempty string> }] }`。
  Verifier 要求 criterion ids 按顺序精确等于 `I01` 至 `I14`、与 criteria 一一对应且每个 evidence
  非空，否则返回
  `criteria.evidence.missing`。`test/skill.test.mjs` 断言 skill 要求在 implementation publication 前
  生成并验证该 artifact，且禁止用 checkbox 或修改 idea definition 记录进度；missing-last-evidence
  trajectory fixture 断言无 status-write 和 push events。
- **I11 Snapshot commands:** 通过注入 Git command recorder，tests 断言 default `check`、
  `check --commit`、`check --remote` 和 `whats-next` 的 success fixtures，以及分别产生
  `config.migration-required`、`idea.revision.candidate-mismatch` 和 primary layout diagnostic 的
  failure fixtures，均不执行 `git worktree add/remove/prune`。`--staged` 与 `--worktree` 仍须通过
  现有 candidate/config authority、SHA-1/SHA-256、symlink、root commit、untracked 和 acceptance
  binding tests。
- **I12 Behavior manifest:** Test suite 暴露并执行以下 17 个 case ids：`branch-mismatch`、`conflict`、
  `dirty`、`behind`、`ahead`、`diverged`、`selector-none`、`selector-known`、`selector-unknown`、
  `unrelated-active-create`、`primary-relocation`、`ulid-collision`、`partial-write-failure`、
  `alias-absent`、`structured-changes`、`publish-coordinates`、`publish-concurrent-move`。Manifest test
  断言排序后的实际 ids 与该集合完全相等；每个 case 断言 action code 和本 criterion 指定的 JSON/
  Git state，不只断言 `ok: true`。
- **I13 Docs and package:** README、Repoledger skill、adoption guide、CLI help 和 installed-package smoke
  只使用 `whats-next`/`create-idea`。Pack test 断言 tarball 至少包含 `bin/repoledger.js`、
  `src/cli.js`、`schema/v3.json` 和 `README.md`，且不含 `test/`、`ideas/`、`.github/` 或
  `skills/`；installed smoke 从该 tarball 安装后断言 help 的精确 command set、创建无 alias scaffold
  成功且 `whatsnext` 返回 exit code `2`。Repository-wide text test 排除 historical idea artifacts
  后，不得出现作为可执行命令的 `repoledger whatsnext`、`newidea` 或 `new-idea`。
- **I14 Project gates:** 同一 candidate 上依次运行 `pnpm check`、
  `node bin/repoledger.js check --worktree --json`、提交后的
  `node bin/repoledger.js check --commit HEAD --json`、`npm run pack:check`、
  `npm run smoke:pack`、`node --test test/skill.test.mjs`、`npm run check:skills` 和
  `git diff --check`；每条 command exit code 均为 `0`，两个 check JSON 均为 `ok: true` 且
  `diagnostics: []`。Markdown link validation 由通过的 `test/skill.test.mjs` 明确断言。

## Deployment acceptance criteria

- **D01 Installed loop:** 从发布后的 primary 打包并安装 package/skill 到 disposable repository。第一次
  `create-idea --json` 在 dirty fixture 中返回 `inspect-worktree-changes`，before/after path manifest
  完全相同；删除 fixture-owned dirty path 后第二次调用在已有 unrelated active idea 时创建无 alias
  scaffold，path manifest 差集恰为返回的空 `Idea.md` 和 sibling status；立即
  `whats-next <ULID>` 返回 `inspect-worktree-changes`；提交并 non-force 发布后再次调用返回
  `prepare-idea`；制造 local-ahead commit 后 publication details 的 repository、branch、commit、
  expected tip 和 validation target 全部与实际 Git state 相等。
- **D02 Isolation artifact:** 每轮保存一个 object，恰含 `command`、`exitCode`、`stdout`、`stderr`、
  `beforeRefs`、`afterRefs`、`beforePaths`、`afterPaths`、`disposableRemoteRefs` 和 `request`。Guidance
  round 恰有一个 action；successful create round 恰有一个 `createdIdea` 且无 action。Verifier 断言
  source checkout 与真实 project remote 的 refs/path manifests 前后相同，disposable remote 只发生
  scripted commits，artifact 无 `environment` field，所有 repository URL 均为无 userinfo/query/
  fragment 的 canonical fixture URL。
- **D03 Windows operation evidence:** 在同一 disposable Windows fixture 上分别从 baseline commit
  `349d20cd79e78146c3067aefe37ed01d388696d1` 与 candidate 运行相同 installed loop，并保存 Node/Git
  versions、每轮 duration 和 Git invocation trace。Baseline trace 必须包含至少一个
  `worktree add`；candidate trace 中 `worktree add`、`worktree remove` 和 `worktree prune` 的计数均
  为 `0`。Candidate 每轮前后的 `git worktree list --porcelain` 完全相同，且 trace 中创建的每个
  Repoledger temporary path 在该轮结束时均不存在；duration 只作观察值，不作为易抖动的 pass/fail
  threshold。

## Constraints

- 所有动作继续由 Git 与 primary snapshot 的可观察事实推导；request context 不是生命周期状态，
  不写入 repository status 或隐藏存储。
- 一个 report 仍只暴露一个当前可执行 action。辅助 context 和 suggested validation 不得成为可
  跳过当前 blocker 的第二条 action。
- `create-idea` 是唯一新增的 filesystem mutation：只允许创建其返回的 folder、空 `Idea.md` 和
  sibling status；重复调用生成新 ULID，不把“已存在”误判为幂等成功。
- Primary relocation 继续分两轮完成：先按 committed HEAD config 同步 relocation commit，再按
  新 HEAD config 观察新 primary。
- Snapshot 优化必须支持 SHA-1/SHA-256 repository、ignored/untracked 规则、Git symlink、root
  commit、staged/worktree candidate 和完整 primary history；不得通过缩小验证范围换取速度。
- 除 `create-idea` 的 scaffold filesystem write 外，所有 Git 写入仍由 Agent 使用普通工具显式
  执行；staging、commit 和 publication 保留 unknown work 与并发历史，禁止 force-push、hard
  reset、broad clean 或静默 stash。

## References

- [Completed hardening idea](../01M36QGPNTXEPP61DA4KP4AVG4/Idea.md)
- [Agent session eval harness idea](../01M36QGPNTXEPP61DA4KP4AVG0/Idea.md)
- [Repoledger skill](../../skills/repoledger/SKILL.md)
- [Whatsnext implementation](../../src/whatsnext.js)
- [Repository checker](../../src/index.js)
- [Git snapshot helpers](../../src/git.js)
