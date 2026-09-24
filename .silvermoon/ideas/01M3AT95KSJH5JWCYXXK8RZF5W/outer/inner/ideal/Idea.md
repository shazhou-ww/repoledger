# 精简并补全 whats-next 的 Agent 可读输出

## Intent

让 `silvermoon whats-next` 的每一种 action 输出都对 Agent 直接可用：文本模式
不丢失行动所需细节，JSON 模式不含成块重复字段。Agent 读完一次输出即知道
"做什么、对哪些路径/提交做、做完写哪个字段"，无需再猜或重复查询。

## Context

对全部 15 种 action（5 个生命周期状态 + 6 个 hygiene 动作 + select/continue/
create + onboarding + 失败路径）做了实际走查，发现两类问题：

**文本模式细节丢失（对 Agent 伤害最大）**。`renderWhatsNext` 只渲染
`world` 和 `ideas` 两种 details；hygiene 类 action 的 details 在文本模式下
完全不可见（实测确认）：

- `inspect-worktree-changes`：JSON 里有 conflicted/staged/unstaged/untracked
  完整路径清单，文本模式只有一行提示——Agent 不知道要处理哪些文件。
- `fast-forward-primary` / `integrate-primary`：from/to、local/remote 提交号
  文本模式不可见。
- `publish-primary`：repository/branch/commit/expectedRemoteTip 不可见。
- `switch-to-primary`：actual/expected 不可见。
- `resolve-conflicts`：冲突清单不可见。

AGENTS.md 引导 Agent 用 `whats-next --json`，但文本模式是默认输出，人和轻量
脚本都会直接读它；丢细节等于逼所有人解析 JSON。

**JSON 模式成块重复（冗余）**。实测量化：

- `continue-active-idea`：`details.idea` 与 `result.selectedIdea` 逐字节相同，
  占 payload 31%。
- `adopt-silvermoon`：`action.details` 与 `result.onboarding` 完全重复，
  占 payload 45%。
- 每条 message 拼接 68 字符语言后缀（"Use zh-CN for ..."），而
  `result.language.tag` 已独立存在。
- `prepare/implement/deploy-idea` 的 message 内嵌完整 40 位 revision，同一
  payload 中该 hash 出现 3 次；message 是给人读的，不应承载机器数据，Agent
  从 message 复制 hash 时还可能与结构化字段不一致。
- `world.auxiliaryRoot` 恒等于 `world.path`（三个生命周期状态实测全部相等），
  纯冗余字段。

## Desired outcome

- 文本模式对每种 action 渲染其 details 中行动必需的信息（路径清单、提交号、
  选项列表等），Agent 不解析 JSON 也能执行动作。
- JSON payload 中每块信息只出现一次：`details` 不再重复
  `selectedIdea`/`onboarding`；message 不再内嵌 revision hash 与语言后缀；
  `auxiliaryRoot` 移除。
- 现有消费者（SKILL.md、docs、测试）同步更新，`pnpm check` 全绿。

## Scope

### In scope

- `src/cli.js` 的 `renderWhatsNext`：为 hygiene 类与 select 类 action 的
  details 增加文本渲染。
- `src/whatsnext.js`：去除 `continue-active-idea` 的 `details.idea`、
  `adopt-silvermoon` 的 details 重复块、`world.auxiliaryRoot`；message 去掉
  revision hash 与语言后缀（语言指令保留在 `result.language`，文本模式渲染
  一行即可）。
- `skills/silvermoon/SKILL.md`、`docs/reference.md` 中对输出形状的描述。
- 单元/契约/集成测试同步。

### Out of scope

- action code 集合与语义（15 种动作的划分本身合理，不动）。
- `check`、`create-idea` 命令的输出形状（create-idea 输出已验证精简）。
- 兼容层：本仓库无外部 API 消费者，按零残留原则直接改形状，不留旧字段别名。
- `request` 回显字段：保留（失败路径 `failed()` 依赖它区分请求类型，移除
  收益小、风险大）。

## Constraints

- 遵循仓库零残留偏好：删除的字段不留兼容别名。
- 文本渲染保持现有两空格缩进风格；长路径清单每行一项，不折行嵌套。
- message 仍是给 Agent 的自然语言指令，必须自足说明动作意图，只是不再承载
  hash 等机器数据。
- 输出形状变化必须同时更新 SKILL.md 与 docs/reference.md，避免文档与实现
  漂移。
