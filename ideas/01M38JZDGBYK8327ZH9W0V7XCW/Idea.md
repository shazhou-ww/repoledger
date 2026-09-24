# 降低 Repoledger 单动作循环的操作摩擦

Created: 2026-09-24
Language: zh-CN

## Goal

在不削弱 `whatsnext` 单一最高优先 action、worktree hygiene、不可变 observation 和
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

## Command naming proposal

新增命令采用 `repoledger create-idea`，保留现有 `repoledger whatsnext`：

- `create-idea` 是完整、明确的 imperative，与现有 action code 同名，也直接说明会产生本地
  mutation；不采用语义不完整的 `new`、`newidea` 或 `new-idea`。
- 不仅为了连字符形式一致而把稳定的 `whatsnext` 改名为 `whats-next`。该重命名没有行为收益，
  却会破坏脚本、skill 和用户习惯。
- 如果未来出现多个 idea mutation command，可在一次明确的 major redesign 中整体评估
  `repoledger idea create` / `repoledger idea next`；本 idea 不提前引入只有一个子命令的 group。

## Scope

- 新增 `repoledger create-idea`，把“创建新 idea”变成明确 intent。它复用 `whatsnext` 的 primary
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

- 让 `whatsnext` 自动 checkout、merge、stage、commit、stash、push 或修改 status。
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

- `repoledger create-idea` 是文档化的 public command；`repoledger whatsnext` 保持原名和默认
  行为，不新增 `new`、`newidea`、`new-idea` 或 `whats-next` 作为竞争入口。
- 无参数、无 alias 调用在 clean、synchronized configured primary 上生成 canonical ULID、空
  `Idea.md` 和仅含 canonical `version`/`id` 的 sibling status；输出稳定的 id、idea path 和 status
  path，但不生成占位 alias、标题、criteria 或 approval。
- Alias 在 schema、runtime parser/serializer、layout、summary、human rendering 和 selector 中均
  为 optional；已有 alias 的 repositories 与 exact alias selection 保持兼容，无 alias idea 只能
  通过 ULID 选择，duplicate validation 只比较实际存在的 alias。
- Scaffold creation 使用 exclusive writes 并处理 ULID collision；不得覆盖任何现有 path。中途失败
  时只清理本次调用已创建的 path，不能删除或改写 unknown work。
- 即使 primary 中已有 unrelated active idea，显式 `create-idea` intent 也可创建 scaffold；但
  dirty/conflicted/non-primary/behind/ahead/diverged 时必须先返回同一 hygiene guidance，且 filesystem
  零变化。默认无 intent 的 `whatsnext` 仍优先导航已有 active idea。
- 成功创建只完成当前 scaffold action，不自动 stage、commit、push 或 reobserve；下一轮
  `whatsnext <ULID>` 从 `preparing` 继续。
- 每个 `whatsnext` JSON report 都能区分 requested context、authoritatively selected idea 和
  当前 blocking action；hygiene 期间不会丢失调用者 selector，也不会把未验证 selector 提升为
  `selectedIdea`。
- `inspect-worktree-changes` details 使用稳定字段分别表示 staged、unstaged、untracked、conflict
  和 rename/copy 状态；人类输出仍简洁，且不包含 Repoledger 无法证明的 ownership 判断。
- `publish-primary` details 足以让 Agent 无需重新读取 config 即可执行 commit validation 和普通
  non-force push，并继续携带 expected remote tip 作为并发边界。
- Repoledger skill 在首次 implementation publication 前要求逐条核对 criteria 与 evidence，且不
  用 checkbox 或 idea-definition mutation 记录核对进度。
- Snapshot implementation 的 benchmark 或稳定计时 fixture 证明常用 HEAD、remote 和
  `whatsnext` 路径减少临时 worktree 创建或显著降低运行时间；性能优化不得改变任何 target 的
  candidate/config authority。
- 回归测试覆盖 dirty/conflicted/branch mismatch/ahead/behind/diverged 下的 request context，显式
  create intent 与 unrelated active idea，A 到 B primary relocation，以及结构化 publication
  coordinates。
- 所有新增 JSON 字段和 CLI command 有兼容性决定、human rendering、README、skill 和 package
  smoke coverage；status alias optionality 对 API consumers 的影响被明确记录，旧 consumer 可忽略
  新增字段，移除或重命名现有字段必须作为明确 breaking change。
- `pnpm check`、`repoledger check --worktree`、`repoledger check --commit HEAD`、pack contents、
  installed-package smoke、Markdown links 和 skill validation 全部通过。

## Deployment acceptance criteria

- 从已发布 primary 安装 package 与 skill，在 disposable repository/remote 中完成至少一条代表性
  loop：`create-idea` 先被 dirty hygiene 阻挡且零写入，清理后在已有 unrelated active idea 时生成
  无 alias 的空 scaffold，随后 `whatsnext <ULID>` 进入 preparing，publication guidance 提供完整
  安全坐标。
- 代表性运行记录每轮 observation、唯一 action、实际执行和 observable delta，证明没有跳过
  hygiene、没有依赖隐藏 conversation state、没有修改真实用户 repository 或 remote。
- Windows 环境的重复运行确认 snapshot 优化没有遗留临时 worktree，并记录与实现前基线可比较
  的耗时结果。

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
