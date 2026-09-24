# 精简 whats-next 的 hygiene 输出

## Intent

让 `whats-next` 聚焦于 Agent 真正需要执行的下一步：hygiene 全部通过时不展示逐项成功信息，存在问题时只展示未通过的 gap 及其可操作要求。

## Context

当前 `whats-next` 会输出大量已通过的 onboarding/hygiene 检查，包括状态、依赖和观测事实。这些过程信息会增加 token 消耗、稀释唯一的最高优先级 action，并可能让 Agent 误判已通过项目仍需处理。

成功的 hygiene 检查只用于证明命令可以继续进行生命周期路由，不应与下一步行动竞争注意力。失败检查则必须提供足够具体的信息，使 Agent 无需重新推导问题和要求即可采取修复行动。

## Desired outcome

### Hygiene 通过

- 当所有 onboarding/hygiene 要求均满足时，人类可读输出不显示 onboarding 状态、执行来源、版本、逐项 requirement 或 recheck，只呈现生命周期路由所需的信息和唯一 action。
- `--json` 成功报告不携带完整 onboarding requirement 矩阵，也不以其他字段重复已通过项目；调用方可由正常返回的生命周期 action 判断 preflight 已通过。

### Hygiene 未通过

- 人类可读输出和 `--json` 只暴露当前未满足、冲突或无法确认的 gap，不包含任何 `satisfied` 或 `inapplicable` requirement。
- 每个 gap 保留稳定 requirement ID、要求名称、状态、是否阻塞、依赖关系、实际观测事实和结构化 remediation；凡修复后需要重新诊断的报告同时提供明确的 recheck 命令。
- 多个 gap 按稳定、确定的顺序输出；推荐修复动作仍服从依赖关系和阻塞优先级，不能因为隐藏成功项目而让 Agent 跳过前置条件。
- 当 onboarding 阻塞生命周期工作时，唯一 action 仍是 `adopt-silvermoon`，其 details 与顶层 gap 表达引用同一组未通过事实，不形成语义冲突。

### 一致性

- 人类可读输出与 `--json` 对“成功时安静、失败时只报告 gap”采用同一判定，不出现一侧精简而另一侧仍输出完整矩阵的情况。
- `whats-next` 在任何路径上仍然只给出一个最高优先级 action；idea 选择、生命周期状态、语言解析、Git hygiene 顺序和 action 优先级保持现有行为。
- `check` 继续提供完整仓库诊断能力，调用方需要逐项审计时无需依赖 `whats-next` 的精简视图。

## Scope

### In scope

- 精简 `whats-next` 的 onboarding/hygiene 人类可读输出。
- 精简并明确 `whats-next --json` 中成功状态与失败 gap 的表达。
- 调整相关稳定输出契约、自动化测试和用户文档。
- 保留失败诊断所需的 requirement identity、observed、blocking、remediation、dependencies 和 recheck 信息。

### Out of scope

- 改变 hygiene 检查本身的判定规则或执行顺序。
- 改变生命周期状态推导、idea 选择或 action 优先级。
- 将完整检查矩阵继续作为 `whats-next` 的默认输出。
- 与本目标无关的 `check` 命令行为重构；`check` 可继续承担完整诊断职责。

## Constraints

- 失败必须显式且可操作，不能因精简输出而静默丢失错误、依赖关系或修复指引。
- JSON 字段变更必须作为明确的契约演进处理，并同步 schema、文档和契约测试。
- 保持输出确定性，使 Agent 和自动化调用方能够稳定消费。
- 不得用空数组、成功占位对象或重复摘要伪装精简；成功报告应真正省略逐项 onboarding 流水账。
- 未知状态、检查异常或缺失观测不能被当作成功过滤，必须作为可见 gap 或现有显式错误返回。
- 成功应当安静，失败应当具体且可行动。
