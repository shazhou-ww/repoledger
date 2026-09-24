# 精简 whats-next 的 hygiene 输出

## Intent

让 `whats-next` 聚焦于 Agent 真正需要执行的下一步：hygiene 全部通过时不展示逐项成功信息，存在问题时只展示未通过的 gap 及其可操作要求。

## Context

当前 `whats-next` 会输出大量已通过的 onboarding/hygiene 检查，包括状态、依赖和观测事实。这些过程信息会增加 token 消耗、稀释唯一的最高优先级 action，并可能让 Agent 误判已通过项目仍需处理。

成功的 hygiene 检查只用于证明命令可以继续进行生命周期路由，不应与下一步行动竞争注意力。失败检查则必须提供足够具体的信息，使 Agent 无需重新推导问题和要求即可采取修复行动。

## Desired outcome

- 当所有 hygiene 检查通过时，`whats-next` 不再打印逐项成功信息，输出直接聚焦于生命周期 action。
- 当 hygiene 未通过时，输出只包含未满足或发生冲突的 gap，不包含任何已通过检查。
- 每个 gap 明确说明稳定标识、未满足的要求、实际观测事实、是否阻塞、修复方式以及修复后的重查入口。
- 人类可读输出和 `--json` 输出遵循同一语义，Agent 无需从完整检查流水账中筛选真正的问题。
- `whats-next` 仍然只给出一个最高优先级 action，不因精简诊断信息而丢失安全的依赖顺序或修复指导。

## Scope

### In scope

- 精简 `whats-next` 的 onboarding/hygiene 人类可读输出。
- 精简并明确 `whats-next --json` 中成功状态与失败 gap 的表达。
- 调整相关稳定输出契约、自动化测试和用户文档。
- 保留失败诊断所需的 expected、observed、blocking、remediation、dependencies 和 recheck 信息。

### Out of scope

- 改变 hygiene 检查本身的判定规则或执行顺序。
- 改变生命周期状态推导、idea 选择或 action 优先级。
- 将完整检查矩阵继续作为 `whats-next` 的默认输出。
- 与本目标无关的 `check` 命令行为重构；`check` 可继续承担完整诊断职责。

## Constraints

- 失败必须显式且可操作，不能因精简输出而静默丢失错误、依赖关系或修复指引。
- JSON 字段变更必须作为明确的契约演进处理，并同步 schema、文档和契约测试。
- 保持输出确定性，使 Agent 和自动化调用方能够稳定消费。
- 成功应当安静，失败应当具体且可行动。
