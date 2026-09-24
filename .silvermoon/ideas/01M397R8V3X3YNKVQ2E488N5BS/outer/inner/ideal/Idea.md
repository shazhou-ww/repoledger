# 提供准确易用的简体中文 README

## Intent

为 Silvermoon 提供一份可发现、准确且易于使用的简体中文版 README，让中文用户无需依赖
英文主文档即可理解项目定位、完成安装配置，并开始使用核心工作流。

## Context

仓库目前只有英文 `README.md`。虽然产品名称和三层世界模型包含中文表达，中文用户仍需
阅读英文说明才能了解 Silvermoon 的职责边界、环境要求、安装与配置、idea 生命周期、
命令用法和验证方式。这提高了首次使用成本，也容易使中文说明散落在非正式渠道并随英文
文档演进而失准。

## Desired outcome

仓库包含一份与英文 README 关键事实一致的简体中文 README，并从英文 README 的显著位置
提供语言入口。中文读者可以仅凭该文档理解 Silvermoon 是什么和不是什么，满足安装前提，
完成安装与基础配置，创建或导航 idea，理解三个世界与状态流转，并找到验证命令、schema
及进一步资料。代码示例、命令、路径、字段名和正式英文术语保持产品原样；中文叙述自然、
清晰，并在首次出现关键世界名称时并列中英文。

## Scope

### In scope

- 新增简体中文 README，覆盖英文 README 中影响理解、安装、配置和日常使用的公开信息，
  包括项目定位与边界、系统要求、安装、配置、idea 存储模型、三个世界、导航、创建、
  验证、协作决策边界和相关资料入口。
- 保留所有可复制命令、配置示例、文件路径、schema 链接和关键行为约束的准确性，内部
  链接从中文文档所在位置可正常解析。
- 在英文 `README.md` 顶部附近添加清晰、对称的中文语言入口，并在中文 README 中提供
  返回英文文档的入口。
- 对照当前 CLI help、package metadata、schema 和英文 README 校验中文内容，避免把
  Agent 行为、人工决定或未发布能力描述成 CLI 自动完成的功能。
- 如 repository contract 或 package contents 检查对 README 文件名、链接或发布内容
  有明确约束，更新直接相关的检查，使中文版文档随 npm 包可用且不会破坏现有验证。

### Out of scope

- 改写英文 README 的结构或文案，语言入口所需的最小编辑除外。
- 修改 CLI、schema、idea lifecycle、repository model、skill 行为或产品术语。
- 翻译所有仓库文档、skill、schema 描述、CLI 输出或源代码注释。
- 建立自动翻译、文档站点、多语言框架或除简体中文以外的本地化版本。
- 发布新的 npm 版本、创建 release tag，或更改包版本号。

## Constraints

- 中文 README 应是面向用户的完整入口，而不是逐句机械翻译；但不得省略会改变安全操作、
  生命周期判断或命令语义的关键限制。
- 中文内容必须以实现时仓库中的英文 README 和产品行为为事实来源；若发现二者不一致，
  不得在本 idea 中顺带改变产品行为。
- 文件命名采用生态中常见且含义明确的 `README.zh-CN.md`，语言入口使用仓库内相对链接。
- 品牌名 `Silvermoon`、命令名、代码标识符和 canonical English world names 不翻译；
  中文说明使用既有正式名称“道心”“内景”“现世”，首次出现时并列英文。
- 文档不得包含凭据、私有环境信息或仅适用于开发者本机的安装步骤。
- 实现必须通过仓库规定的 Markdown 链接、package contents、installed-package smoke、
  `git diff --check` 和适用的完整检查；不得以中文版 README 为由放宽现有断言。
