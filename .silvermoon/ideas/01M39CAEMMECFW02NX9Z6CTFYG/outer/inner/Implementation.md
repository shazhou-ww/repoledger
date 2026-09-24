# 实现分层 preferred language 配置

## Steps

### I-S01: 建立规范语言 tag 与全局配置基础设施

增加共享的 BCP 47 language tag 规范化和校验能力，以 `Intl.getCanonicalLocales` 的规范结果
作为持久化 canonical 形式。增加独立的用户全局配置加载器，固定读取
`~/.config/silvermoon/config.yaml`；该文件只接受 version 1 和可选
`preferredLanguage`，缺失文件等价于未配置，非法 YAML、未知字段、不可读取路径或非法及
非 canonical tag 则返回带实际路径和修复方式的诊断。

### I-S02: 扩展项目与 idea 的 v1 存储契约

在项目配置中加入可选 `preferredLanguage`，在 idea status 中加入可选 `language`，并同步
JSON Schema、runtime validation、canonical YAML 字段顺序和序列化。既有缺少字段的文件继续
有效；显式字段只接受 canonical BCP 47 tag。`language` 排在 `alias` 之后且保持为 world
revision 之外的 status fact。

### I-S03: 解析有效语言并接入 whats-next

实现 `idea language > project preferredLanguage > global preferredLanguage > en-US` 的纯解析
规则，并报告规范化后的有效 tag 与 `idea`、`project`、`global` 或 `default` 来源。
`whats-next` 在同一次 repository observation 中加载项目和 idea 配置，再读取当前用户全局
配置；JSON result 和人类可读输出均展示有效语言及来源，每个 action guidance 明确要求 Agent
使用该语言撰写或更新自然语言内容。显式配置错误阻止路由，不降级到更低层级。

### I-S04: 为 create-idea 增加单次 language override

为 `create-idea` 增加 `--language <tag>`，在 preflight 前规范化交互输入并把 canonical tag
传入创建逻辑。只有显式提供 override 时，新 status 才写入 `language`；未提供时保持动态继承。
非法 override 返回稳定的 CLI/JSON 诊断且不创建目录或文件。`whats-next` 和 `check` 不接受
该选项。

### I-S05: 更新文档、技能和发布内容

更新英文与中文 README、CLI reference、getting-started/operations 文档以及 canonical
Silvermoon skill，说明三个层级、固定全局路径、默认值、动态继承、override 边界和 action
语言约束。确认新增运行时代码与 schema 进入 npm tarball，且技能副本保持同步。

## Acceptance criteria

### I-AC01: 三层存储契约兼容且严格

项目配置和 idea status 的新可选字段能以规定顺序 round-trip，用户全局配置从
`~/.config/silvermoon/config.yaml` 加载；既有无字段 fixture 仍通过。对未知字段、错误类型、
非法或非 canonical BCP 47 tag、非 canonical YAML、不可读取或非普通全局配置路径的自动化
测试必须得到明确诊断而非静默回退。

### I-AC02: 解析优先级、来源和动态继承可证明

单元与集成测试覆盖 idea、project、global、`en-US` 四种来源以及逐层遮蔽，并证明未设置
idea language 时修改项目或全局配置会在下一次 `whats-next` 观察中生效，而继承结果不会写回
status。任一显式层非法时测试必须证明命令失败且不使用更低层级值。

### I-AC03: whats-next 的 JSON、文本和 action guidance 一致

CLI 与 API 测试证明 `whats-next` JSON result 暴露有效 language tag 和来源，人类可读输出显示
同一结果，所有 idea、repository hygiene、create 与 review action message 都包含使用该语言
处理自然语言内容的明确要求；命令、标识符、schema 字段和原样工具输出不被本地化。

### I-AC04: create-idea override 只在显式请求时持久化

集成测试证明 `create-idea --language zh-cn` 将规范化的 `zh-CN` 写入新 status，API 接收同等
override；未传参数时 status 不含 `language` 且继续继承。非法 override 必须在任何文件系统或
Git mutation 前失败，`whats-next` 与 `check` 的 CLI option contract 保持不接受 override。

### I-AC05: 仓库与发布验证全部通过

运行 `pnpm check` 必须通过，其中包含 schema contract、unit、integration、package contents、
installed-package E2E 和 skill discovery；文档测试证明英文、中文和 reference surface 与实现
一致，打包检查证明所有新增运行时文件与 schema 均被发布。
