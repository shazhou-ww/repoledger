# Progress

Updated: 2026-09-22

## Current state

项目级默认任务语言的运行时配置、解析优先级、CLI、schema、文档和 skill 已完成
实现与自动化验证。所有验收条件已满足；下一步发布 source、集成 primary，并进入
exact-commit delivery review。

## Decisions

- `repoledger.yaml#taskLanguage` 是可选且必须已规范化的 BCP 47 tag，固定序列化在 `tasksDirectory` 之后；缺失时保持现有配置兼容。
- `config resolve task-language` 默认读取项目配置，解析顺序为 override、project、preference、default；`--global` 保留仓库外旧行为并跳过 project 层。
- 项目模式 JSON 同时报告 `configPath` 与 `preferencesPath`，全局模式保留原有 `path` 字段。
- `/repoledger new` 的 agent 回复使用当次解析值；`/repoledger exec` 和 `/repoledger complete` 使用任务已记录的 `Language`，命令、标识符、协议标记和原样工具输出不翻译。

## Human approvals

| Checkpoint | Status | Review artifact and decision evidence |
| --- | --- | --- |
| Scope | Approved | 用户于 2026-09-22 明确批准 authoritative `Task.md` 中的目标、范围、非目标、约束和验收标准。 |
| Interface | Approved | 用户于 2026-09-22 审阅并明确批准 `repoledger.yaml` 字段、CLI 解析来源及 agent 回复语言契约。 |
| Business and data model | Not applicable | 不改变业务实体、关系、生命周期记录或持久化业务数据；配置 schema 与语言优先级由 Interface review 覆盖。 |
| Architecture | Not applicable | 沿用现有配置、语言解析、用户偏好和 skill 模块边界。 |
| Delivery acceptance | Pending | 等待完整验证、source publication、primary 集成及 exact-commit delivery review。 |

## Validation

- `node --test test/language.test.js`：6 项通过，覆盖四层优先级及非法输入。
- `node --test test/config.test.js`：12 项通过，覆盖可选 canonical 项目字段、schema 模式及序列化边界。
- `node --test test/cli.test.js`：19 项通过，覆盖旧全局路径和 project、override、preference、default 来源。
- `node --test test/skill.test.mjs`：2 项通过，覆盖 skill 契约与任务工件语言指令。
- `node --test test/publication.test.js`：12 项通过；确认首次全套运行的未决 Promise 是偶发进程异常而非回归。
- 独立只读审查：指出的 schema 与序列化边界缺口已修复并增加回归测试；无其余 blocking finding。
- `repoledger config resolve task-language --json`：本仓库返回 `source: project` 与 `value: zh-CN`。
- `repoledger check project-default-task-language`：修改后本地快照通过。
- `pnpm check`：109 项测试通过，并通过 package 内容、安装后 smoke 和 skill discovery 检查。

## Blockers

- None.

## Outcome

已实现并验证项目默认语言和 agent 回复语言契约。剩余动作是发布 source、集成
primary，并请求 exact-commit delivery approval。
