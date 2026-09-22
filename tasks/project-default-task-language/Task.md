# 支持项目级默认任务语言

Created: 2026-09-22
Language: zh-CN

## Goal

Repoledger 允许项目在 `repoledger.yaml` 中声明共享的默认任务语言，并按“单次
override、项目默认值、用户偏好、`en`”的顺序解析新任务语言；解析结果仍固化在
`Task.md` 中，使后续恢复和移交不受配置或操作者变化影响。Repoledger agent 在
创建、执行和完成任务时面向用户撰写的回复也遵循相应的有效语言。

## Context

当前任务语言只支持单次 `--language` override、仓库外用户偏好和内置 `en` 回退。
严格的 version 2 项目配置不接受语言字段，因此同一项目的贡献者可能因各自偏好
不同而创建不同语言的任务，除非每次显式传参。项目需要一个受版本控制、团队共享
但不强制覆盖单次选择的默认值；现有任务的稳定 language track 和个人全局偏好仍应
保持各自边界。

## Scope

- 在 `repoledger.yaml` 中增加可选的规范 BCP 47 `taskLanguage` 字段，并同步运行时配置校验、规范序列化和 JSON Schema。
- 将新任务语言解析顺序扩展为单次 override、项目默认值、用户偏好、内置 `en`。
- 使项目内的有效语言解析能够读取项目配置并报告实际来源，同时保留仓库外用户偏好的读取和设置能力。
- 更新 Repoledger skill，使 `/repoledger new` 使用项目感知的解析结果并将其记录到 `Task.md`，同时以该语言回复用户。
- 使 `/repoledger exec` 和 `/repoledger complete` 期间 agent 面向用户撰写的回复遵循任务已记录的 `Language`，而非重新解析当前项目默认值或用户偏好。
- 更新 CLI 帮助、README 和自动化测试，覆盖字段校验、完整优先级、无项目默认值兼容性及来源报告。

## Out of scope

- 将项目语言变成禁止单次 override 的强制策略。
- 修改已有任务记录的 `Language`，或根据项目默认值翻译历史工件。
- 翻译英文机器协议标记、CLI 命令、诊断消息或整个项目文档。
- 从现有用户偏好自动写入 `repoledger.yaml`，或根据任务正文猜测语言。

## Acceptance criteria

- [x] version 2 `repoledger.yaml` 接受可选的规范 BCP 47 `taskLanguage`，非法或非规范值产生明确且可操作的诊断。
- [x] 未配置 `taskLanguage` 的现有项目配置继续有效，且无需迁移即可保持当前行为。
- [x] 单次 `--language` override 优先于项目默认值，且不修改项目配置或用户偏好。
- [x] 未提供单次 override 时，项目默认值优先于当前用户偏好。
- [x] 未配置项目默认值时使用用户偏好；两者均未配置时稳定回退到 `en`。
- [x] 有效语言解析的文本和 JSON 输出能够区分 override、项目、用户偏好和内置默认来源。
- [x] `/repoledger new` 将解析后的规范语言写入新任务的 `Task.md`，之后恢复或移交仍以该记录为准。
- [x] `/repoledger new` 的 agent 自然语言回复使用当次解析出的有效语言；`/repoledger exec` 和 `/repoledger complete` 的回复使用任务已记录的 `Language`，即使当前项目默认值或用户偏好不同。
- [x] 全局用户偏好的读取、设置和仓库外解析场景保持兼容，不要求存在 `repoledger.yaml`。
- [x] 配置 schema、CLI 帮助、README、skill 指令和自动化测试对字段名称及优先级描述一致。

## Constraints

- `taskLanguage` 是共享默认值而非策略约束；显式单次 override 始终具有最高优先级。
- 项目值和持久化任务值必须使用规范 BCP 47 tag；输入规范化与已存配置的严格校验边界保持明确。
- 现有不含该字段的 version 2 配置、legacy task 的 `en` 回退及 `Task.md` language track 保持向后兼容。
- 配置输出继续采用确定字段顺序和 LF 行尾；不得把用户偏好或用户配置路径写入仓库状态。
- 项目感知解析不得隐式修改配置、偏好、任务工件或 Git 工作树。
- 回复语言只约束 agent 自行撰写的用户可见叙述；命令、标识符、英文机器协议标记和原样引用的工具输出保持其既有形式。

## Human review checkpoints

Task creation records this plan, not approval.

| Checkpoint | Applicability | Reviewer | Planned review artifact | Approval required before |
| --- | --- | --- | --- | --- |
| Scope | Required | User or accountable owner | 本文的目标、范围、非目标、约束和验收标准。 | Substantive implementation. |
| Interface | Required | User or accountable owner | `repoledger.yaml` 字段、语言解析命令、来源输出、agent 回复语言、skill 调用方式及兼容行为。 | Implementing the affected interface. |
| Business and data model | Not applicable: 不改变业务实体、关系、生命周期记录或持久化业务数据；配置 schema 与语言优先级由 Interface review 覆盖。 | Not applicable | Not applicable | Not applicable |
| Architecture | Not applicable: 沿用现有配置、语言解析、用户偏好和 skill 模块边界。 | Not applicable | Not applicable | Not applicable |
| Delivery acceptance | Required | User or accountable owner | 已发布实现、自动化验证结果及各优先级分支的代表性演示。 | Running `task complete` for the exact approved primary commit. |

## References

- [现有用户首选语言任务](../preferred-task-language/Task.md)
- [项目配置实现](../../src/config.js)
- [任务语言解析](../../src/language.js)
- [version 2 schema](../../schema/v2.json)
- [Repoledger skill](../../skills/repoledger/SKILL.md)
- [Repository task profile](../../docs/repository-tasks.md)