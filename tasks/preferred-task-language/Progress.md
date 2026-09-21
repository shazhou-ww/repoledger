# Progress

Updated: 2026-09-21

## Current state

实现与自动化验证已完成。本实现提交发布到共享 source 并集成 primary 后，进入
exact-commit delivery review。

## Decisions

- 用户偏好使用仓库外的严格 canonical YAML 文件，按平台选择用户配置目录；写入通过同目录临时文件原子替换，并拒绝符号链接目标。
- `config resolve --global task-language` 统一执行“单次 override、用户 preference、`en` 默认值”的优先级，显式 override 不修改持久偏好。
- `Task.md` 中唯一且规范的 `Language` 是任务 language track；`status` 从该工件读取，不在 `status.yaml` 中复制事实。
- legacy task 缺少 `Language` 时固定使用 `en`；正文不参与语言推断，现有英文协议标记保持不变。

## Human approvals

| Checkpoint | Status | Review artifact and decision evidence |
| --- | --- | --- |
| Scope | Approved | 用户于 2026-09-21 批准 authoritative `Task.md` 中的目标、范围、非目标、约束和验收标准。 |
| Interface | Approved | 用户于 2026-09-21 批准用户级配置命令、单次覆盖、任务语言展示与回退行为。 |
| Business and data model | Approved | 用户于 2026-09-21 批准用户偏好与 task language track 分离、BCP 47 标识及优先级规则。 |
| Architecture | Approved | 用户于 2026-09-21 批准 CLI、用户配置存储、skill 指令和工件校验器的职责边界。 |
| Delivery acceptance | Pending | 等待已发布实现、验证证据和 `zh-CN` 行为的 exact-commit delivery review。 |

## Validation

- `pnpm check`：通过 98 项测试，并通过 npm pack、安装后 smoke 和 skill 发现检查。
- `node bin/repoledger.js config resolve --global task-language --language zh-cn`：返回 canonical `zh-CN`，来源为 `override`。
- `node bin/repoledger.js status preferred-task-language --local`：返回任务记录的 `language zh-CN`。
- 编辑器诊断：所有改动的运行时代码文件均无错误。
- 独立只读审查：发现的损坏偏好 override 处理和安全写入问题已修复，并增加回归测试。

## Blockers

- None.

## Outcome

已实现仓库外用户语言偏好、确定性解析、任务级语言锁定、legacy 回退、状态展示、
skill 工作流和文档。剩余动作是发布、远程验证和 delivery approval。