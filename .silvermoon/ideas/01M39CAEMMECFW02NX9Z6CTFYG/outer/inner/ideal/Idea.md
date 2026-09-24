# 恢复分层 preferred language 配置

## Intent

让 Silvermoon 支持用户全局、项目和具体 idea 三个层级的 preferred language，
并让 `silvermoon whats-next` 明确提示 Agent 使用解析后的语言输出文档和其他自然语言内容。

## Context

迁移到 Silvermoon 之前，Repoledger 已支持仓库外的用户语言偏好、项目级
`taskLanguage`，以及记录在具体 task 中的稳定 language track。迁移后，这组能力没有进入
当前 `.silvermoon/` 模型：

- 用户无法为所有仓库设置一个可复用的全局首选语言；
- 项目无法声明由团队共享的默认语言；
- idea 无法保存自己的语言偏好并在换人、换机器或跨会话后继续使用；
- `whats-next` 不报告有效语言，也不约束 Agent 后续创建或修改内容时使用哪种语言。

因此，Agent 只能根据当前对话或已有正文猜测语言。同一个 idea 的道心、内景、现世、
ledger 和 supporting artifacts 可能在不同会话中混用语言，也无法解释最终选择来自哪个配置层级。

## Desired outcome

Silvermoon 为 preferred language 提供确定、可解释的分层解析：

1. 具体 idea 的偏好优先；
2. 未设置 idea 偏好时使用项目默认值；
3. 未设置项目默认值时使用当前用户的全局偏好；
4. 三个层级均未设置时使用文档化的内置默认语言。

语言值使用规范 BCP 47 tag，例如 `en` 或 `zh-CN`。`whats-next` 的人类可读输出和 JSON
结果都暴露解析后的有效语言及其来源，并在当前 action guidance 中明确要求 Agent 使用该语言
撰写或更新自然语言内容。该要求覆盖三个 world entry、同 world supporting artifacts、
`ledger.md` 以及 Agent 面向用户自行撰写的说明；命令、标识符、schema 字段、固定协议标记和
原样工具输出保持原有形式。

idea 级偏好一旦设置，就在后续恢复和移交中保持权威，不因操作者或其全局偏好变化而改变。
缺少 idea 级偏好的 idea 仍可按项目、用户和内置默认值继承语言。每次解析都报告实际来源，
非法或不可读取的显式配置产生可操作诊断，不静默伪装成更低层级的成功结果。

## Scope

### In scope

- 定义 Silvermoon 用户全局 preferred language 的仓库外存储、发现和读取契约。
- 在项目配置中增加团队共享的默认 preferred language。
- 为具体 idea 增加可持久化的 preferred language，并纳入 canonical metadata 与 schema。
- 定义并实现 `idea > project > global > built-in default` 的解析优先级、规范化规则和来源报告。
- 让 `create-idea` 与 `whats-next` 在适用场景中解析有效语言，并让 `whats-next` action
  guidance 明确约束 Agent 的自然语言输出。
- 更新 CLI 文本与 JSON surface、skill、README、schema、package contents 和自动化测试，
  保证三个配置层级、继承、错误和默认回退行为一致。
- 为当前仓库中迁移自 Repoledger 的语言元数据制定明确迁移方式，并保证没有语言字段的
  既有 idea 继续有效。

### Out of scope

- 自动翻译既有文档，或仅根据正文内容猜测语言。
- 本地化 CLI 命令名、JSON 字段、诊断 code、schema 标识符或其他机器协议。
- 将用户全局偏好提交到仓库，或允许它覆盖 primary repository、primary branch、
  lifecycle decision 等项目事实。
- 把 preferred language 解释为 approval、implementation acceptance、deployment acceptance
  或任何其他 lifecycle decision。
- 建立通用翻译系统、翻译记忆、文档站点本地化框架或多语言并行内容模型。

## Constraints

- 用户全局偏好必须位于仓库之外并遵循平台约定；项目和 idea 配置必须可版本化、可审计。
- 已存配置只接受规范 BCP 47 tag；交互式输入可以规范化，但最终写入必须确定且 canonical。
- `check --worktree`、`check --staged`、`check --commit` 和 `check --remote` 的仓库事实验证
  不得依赖当前执行者的用户全局配置。
- `whats-next` 必须基于同一次 repository observation 解析项目和 idea 层级，不能把不同
  revision 的配置与 action guidance 拼接在一起。
- 改变 preferred language 不得自动改写历史内容或隐式改变 lifecycle decision；
  对契约正文进行翻译或实质性改写时，仍按正常 world revision 规则处理。
- 既有未配置 preferred language 的仓库和 idea 必须继续可读，并使用文档化的继承与默认行为。

## Open questions

- `create-idea` 是否应把当时解析到的有效语言固化为 idea 级偏好，还是在用户没有显式指定时
  保留动态继承。
- 是否恢复旧 Repoledger 的单次 CLI language override；如果恢复，它应高于 idea 偏好还是
  仅用于创建时写入 idea 偏好。
- 迁移时是否将既有 world 文档顶部的 `Language:` 元数据提升为 idea 配置，还是只迁移能够
  无歧义对应到整个 idea 的记录。
