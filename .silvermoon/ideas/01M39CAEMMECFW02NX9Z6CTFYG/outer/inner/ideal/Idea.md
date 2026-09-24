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

1. 具体 idea 的 `status.yaml` 中可选的 `language` 优先；
2. idea 未设置 `language` 时，使用项目 `.silvermoon/config.yaml` 中可选的
   `preferredLanguage`；
3. 项目未设置 `preferredLanguage` 时，使用用户全局 `config.yaml` 中可选的
   `preferredLanguage`；
4. 三个可选字段均未设置时，稳定回退到 `en-US`。

语言值使用规范 BCP 47 tag，例如 `en` 或 `zh-CN`。`whats-next` 的人类可读输出和 JSON
结果都暴露解析后的有效语言及其来源，并在当前 action guidance 中明确要求 Agent 使用该语言
撰写或更新自然语言内容。该要求覆盖三个 world entry、同 world supporting artifacts、
`ledger.md` 以及 Agent 面向用户自行撰写的说明；命令、标识符、schema 字段、固定协议标记和
原样工具输出保持原有形式。

idea 级偏好一旦设置，就在后续恢复和移交中保持权威，不因操作者或其全局偏好变化而改变。
缺少 idea 级偏好的 idea 保持动态继承：每次 `whats-next` 都根据当时观察到的项目配置和
当前用户全局配置重新解析，不把继承结果固化到 `status.yaml`。项目或全局默认值变化后，
未设置 `language` 的 idea 在下一次观察时使用新值。每次解析都报告实际来源，非法或不可读取的
显式配置产生可操作诊断，不静默伪装成更低层级的成功结果。

`create-idea` 是唯一接受单次 language override 的命令。显式 override 经过规范化后写入新
idea 的 `status.yaml` `language` 字段；未提供 override 时不写该字段，保留动态继承。
`whats-next` 和 `check` 不提供 language override。

## Scope

### In scope

- 为仓库外、平台约定位置的用户全局 `config.yaml` 增加可选 `preferredLanguage`。
- 为项目 `.silvermoon/config.yaml` 增加可选 `preferredLanguage`，作为团队共享默认值。
- 为每个 idea 的 `status.yaml` 增加可选 `language`，作为该 idea 的可变状态。
- 直接扩展尚未正式发布的 v1 config 与 idea status schema、runtime validation 和
  canonical YAML 字段顺序。
- 定义并实现 `idea language > project preferredLanguage > global preferredLanguage >
  en-US` 的解析优先级、规范化规则、动态继承和来源报告。
- 让 `create-idea` 支持单次 language override；仅在显式提供 override 时把规范值写入新
  idea 的 `status.yaml`。
- 让 `whats-next` 解析并报告有效语言，在 action guidance 中明确约束 Agent 的自然语言输出；
  `whats-next` 与 `check` 均不增加 language override。
- 更新 CLI 文本与 JSON surface、skill、README、schema、package contents 和自动化测试，
  保证三个配置层级、继承、错误和默认回退行为一致。
- 保证所有缺少新可选字段的既有全局配置、项目配置和 idea 继续有效。

### Out of scope

- 增加 schema v2、修改任何 schema `version` 值，或为这次变更建立版本迁移和兼容层；
  v1 尚未正式发布，本变更直接更新 v1。
- 将动态继承结果自动固化到 idea，或在未显式 override 时由 `create-idea` 写入
  `status.yaml` `language`。
- 为 `whats-next`、`check` 或其他命令增加单次 language override。
- 把 language 保存为 world 文档或 `ledger.md` 的 frontmatter、标题或其他文档元数据。
- 读取、迁移或解释既有文档中的 `Language:` 行，自动翻译既有文档，或仅根据正文内容猜测语言。
- 本地化 CLI 命令名、JSON 字段、诊断 code、schema 标识符或其他机器协议。
- 将用户全局偏好提交到仓库，或允许它覆盖 primary repository、primary branch、
  lifecycle decision 等项目事实。
- 把 preferred language 解释为 approval、implementation acceptance、deployment acceptance
  或任何其他 lifecycle decision。
- 建立通用翻译系统、翻译记忆、文档站点本地化框架或多语言并行内容模型。

## Constraints

- `preferredLanguage` 和 `language` 均为 optional；缺少字段不得产生迁移要求或 validation
  error，且最终 fallback 必须始终为 `en-US`。
- 用户全局 `config.yaml` 必须位于仓库之外并遵循平台约定；项目
  `.silvermoon/config.yaml` 和 idea `status.yaml` 必须可版本化、可审计。
- 已存配置只接受规范 BCP 47 tag；交互式输入可以规范化，但最终写入必须确定且 canonical。
- `check --worktree`、`check --staged`、`check --commit` 和 `check --remote` 的仓库事实验证
  不得依赖当前执行者的用户全局配置。
- `whats-next` 必须基于同一次 repository observation 解析项目和 idea 层级，不能把不同
  revision 的配置与 action guidance 拼接在一起。
- 改变 preferred language 不得自动改写历史内容或隐式改变 lifecycle decision；
  对契约正文进行翻译或实质性改写时，仍按正常 world revision 规则处理。
- idea 的 `language` 是 `status.yaml` 中的可变状态，不属于任何 world 文档，不参与
  ideal、implementation 或 deployment revision，也不因修改而撤销既有 approval 或 acceptance。
- 既有未配置 preferred language 的仓库和 idea 必须继续可读，并使用文档化的继承与默认行为。
