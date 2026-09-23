# 支持用户首选的任务描述语言

Created: 2026-09-21
Language: zh-CN

## Goal

Repoledger 允许每位用户在仓库之外保存首选的任务描述语言，并允许单次
`/repoledger new` 调用覆盖该偏好。创建任务时将解析后的语言记录为该任务稳定的
language track，后续任务工件使用同一语言，机器解析所需的英文结构标记保持不变。

## Context

`repoledger.yaml` 是由团队共享并提交到仓库的严格配置契约，不适合保存因人而异的
语言偏好。当前任务模板和校验器还将英文标题、检查点名称及状态值作为机器协议，
因此语言选择需要与这些稳定标记解耦。个人偏好只决定新任务的初始选择；已登记
任务必须记录自己的语言，使换人、换机器或个人偏好变化不会改变后续工件语言。
首个目标用例是将用户偏好和任务 language track 设为 `zh-CN`。

## Scope

- 增加仓库外、用户级的任务语言偏好，并提供可发现的 CLI 读取和设置方式。
- 允许 `/repoledger new` 为当前任务显式覆盖用户偏好。
- 定义并实现“单次覆盖、用户偏好、默认回退”的确定性解析顺序。
- 在新建 `Task.md` 中以规范的 `Language: <BCP 47 tag>` 记录解析结果，作为该任务的持久语言事实。
- 更新 Repoledger skill，使恢复或移交任务时以任务记录的语言为准，并使 `Task.md`、`Progress.md` 和 `UserAcceptance.md` 的叙述性正文保持同一 language track。
- 将没有 `Language` 记录的 legacy task 按 `en` 处理，不根据正文猜测语言。
- 为 `zh-CN`、覆盖顺序、任务语言锁定、legacy 回退及配置错误增加测试和文档。

## Out of scope

- 在 `repoledger.yaml` 中保存个人语言偏好或增加仓库强制语言策略。
- 翻译校验器依赖的 Markdown 标题、检查点名称、适用性、审批状态和结果值。
- 自动翻译已有任务、根据当前操作者偏好切换已登记任务的语言，或本地化 CLI 命令、诊断消息及全部项目文档。

## Acceptance criteria

- [x] 用户能够在仓库之外持久设置并读取任务语言偏好，且该操作不会修改 Git 工作树。
- [x] 新任务在 `Task.md` 中记录一个经过验证的规范 BCP 47 `Language` 值。
- [x] 用户偏好为 `zh-CN` 且没有单次覆盖时，新任务记录 `Language: zh-CN`，其叙述性正文使用简体中文。
- [x] 单次语言覆盖优先于用户偏好，且不改变持久化偏好。
- [x] 没有单次覆盖和用户偏好时，行为按文档约定稳定回退，并保持向后兼容。
- [x] 恢复或移交已登记任务时，后续任务工件遵循其 `Language`，不受当前操作者偏好影响。
- [x] 缺少 `Language` 的 legacy task 确定性地按 `en` 处理，不执行语言猜测或历史工件翻译。
- [x] 无论正文语言为何，现有英文机器协议标记和生命周期校验继续有效。
- [x] 非法或不可读取的语言偏好产生明确诊断，不会静默写入仓库级配置。
- [x] 自动化测试覆盖用户级配置、优先级、`zh-CN` 生成约束、任务语言锁定和 legacy 回退。

## Constraints

- 个人语言偏好不得进入 `repoledger.yaml`、任务状态或其他受版本控制的仓库状态；解析后的任务语言必须记录在该任务的 `Task.md` 中。
- 语言标识采用文档化的 BCP 47 形式；首个明确支持和验证的值为 `zh-CN`。
- 偏好存储必须跨仓库复用、避免凭据或私密内容，并在受支持平台上使用可预测的位置。
- 已登记任务的 `Language` 是恢复和移交时的权威值，个人偏好只作为创建新任务时的输入。
- 保持现有任务工件格式和校验规则向后兼容；协议标记、任务语言元数据与自然语言正文必须有清晰边界。

## Human review checkpoints

Task creation records this plan, not approval.

| Checkpoint | Applicability | Reviewer | Planned review artifact | Approval required before |
| --- | --- | --- | --- | --- |
| Scope | Required | User or accountable owner | 本文的目标、范围、非目标、约束和验收标准。 | Substantive implementation. |
| Interface | Required | User or accountable owner | 用户级配置命令、`/repoledger new` 单次覆盖语法、任务语言展示、回退行为和兼容性。 | Implementing the affected interface. |
| Business and data model | Required | User or accountable owner | 语言标识、用户级存储模型、每个任务的 language track、优先级规则及仓库状态边界。 | Implementing the affected model or data changes. |
| Architecture | Required | User or accountable owner | CLI、用户配置存储、skill 指令和工件校验器之间的职责边界。 | Implementing the affected structural changes. |
| Delivery acceptance | Required | User or accountable owner | 已发布实现、自动化验证结果及 `zh-CN` 任务创建演示。 | Running `task complete` for the exact approved primary commit. |

## References

- [Repoledger skill](../../skills/repoledger/SKILL.md)
- [Repository task profile](../../docs/repository-tasks.md)
