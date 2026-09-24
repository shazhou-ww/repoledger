# 面向读者重构 README 与项目文档

## Intent

将中英文 README 从实现细节汇总页重构为面向新读者的产品入口：让读者先快速开始使用，
再理解 Silvermoon 解决的问题、项目器灵的身份与三重世界观。把使用时不必立即掌握的
协议和实现细节迁入英文 `docs/`，由 README 通过 Further Reading 提供清晰入口。

## Context

当前 `README.md` 和 `README.zh-CN.md` 同时承担产品定位、安装配置、世界观、存储布局、
revision 语义、状态推导、CLI 行为、validation、adoption 与开发说明。信息本身有价值，
但首次接触项目的读者还没有理解 Silvermoon 为什么存在，就需要先消化大量协议细节；
核心产品价值和独特世界观也因此被稀释。

Silvermoon 要解决的问题应聚焦为三点。第一，让人少操心：Agent 根据仓库事实自行延续，
只在目标批准、实现验收和现世验真等关键节点请人决定。第二，让任务和代码状态保持一致：
状态不能由一张脱离代码的卡片宣称，而应由当前产物和已经作出的决定共同证明。第三，让
工作跨设备、跨 session、跨托管平台延续：上下文属于项目，而不寄存在某次对话、某台
机器或某个 Agent 中。

项目名称还承载了一层简洁而有辨识度的背景。银月是《凡人修仙传》中的人物，来自灵界的
银月狼族，是玲珑公主分裂出的两道元神之一。她在人界失去部分记忆后以银月之名作为器灵，
先后寄居于狼首玉如意和韩立的青竹蜂云剑。这个人物关系与 Silvermoon 的产品定位相呼应，
但它只应作为人物小传和趣味来源，不应扩展成需要读者了解原作的设定负担。人物小传之后
可以提供 YouTube 与哔哩哔哩的官方动画入口，作为对原作与动画创作者的简短致敬。

## Desired outcome

新读者打开任一 README 后，紧接顶部主视觉和一句话定位便能看到 Quick Start，并能用最短
路径安装、配置和开始一次 Silvermoon 工作流。继续阅读时，读者能通过连贯叙事理解三个
核心问题、人与 Agent 的决策边界，以及为什么 Silvermoon 是“项目的器灵”。

README 以具有哲学意味但系统、克制的方式说明：项目不是任务列表或对话记录，而是理想逐渐
进入现实的过程；道心立意，内景成形，现世验真；三个世界由内而外层层包含，因此内层变化会
使外层旧结论失去依据。世界观使用短篇连贯叙事，而不是大量术语 bullet 或实现算法。

英文和简体中文 README 在结构、承诺与阅读路径上保持一致。精确的存储、revision、schema、
CLI、validation、adoption 和维护者信息在英文 `docs/` 中各有清晰、唯一的权威位置，README
通过 Further Reading 帮助不同读者继续深入，而不重复维护同一套规范。

## Scope

### In scope

- 重构 `README.md` 与 `README.zh-CN.md` 的信息架构和正文，使顶部主视觉之后的第一个实质
  section 是 Quick Start。
- 用三个聚焦的问题阐释产品价值：减少人的持续照看而只停在关键决策点、保持任务与代码状态
  一致，以及实现跨设备、跨 session、跨托管平台的 continuity。
- 将中文定位统一为“项目的器灵”，英文定位统一为 “the artifact spirit of the project”，
  并同步直接相关的用户可见产品文案。
- 增加简短的人物小传，只介绍银月来自灵界的银月狼族、是玲珑公主的分魂之一，以及她作为
  器灵先后寄居的狼首玉如意（a wolf-headed jade scepter）和青竹蜂云剑
  （the Bamboo Cloudswarm Swords），不展开额外原作剧情。
- 在人物小传结尾以一行简短链接邀请读者观看《凡人修仙传》官方动画，使用稳定的
  [YouTube](https://www.youtube.com/watch?v=qlodDgpiYhg) 与
  [哔哩哔哩第 1 话](https://www.bilibili.com/bangumi/play/ep733316) 页面，不保留分享
  tracking 参数。
- 将只服务于文档的根级 `assets/` 迁入 `docs/assets/`，并更新仓库浏览、npm package、
  README 渲染和测试中的全部引用，使文档与其视觉资源具有同一个清晰归属。
- 在人物小传附近使用迁移后的 `docs/assets/silvermoon-avatar.svg` 线稿头像，默认宽度约
  128 px 且不超过 144 px；保留现有顶部主视觉的主次关系，并提供准确的替代文本。
- 以连贯 prose 系统阐释道心、内景、现世的嵌套关系、因果传导、决策边界与项目归属，保留
  “道心立意，内景成形，现世验真”作为核心表达。
- 将 README 中使用前不必掌握的精确技术内容迁入英文 `docs/`，按入门、核心概念、操作指南、
  技术参考和维护者信息组织成不过度碎片化的阅读体系。
- 在两个 README 中增加同构的 Further Reading 导航，并确保现有重要说明在迁移后仍可发现。
- 同步 package 内容清单、文档链接、smoke expectations 和相关检查，使 README、头像及
  Further Reading 在 GitHub 与发布后的 npm package 表面均可用。

### Out of scope

- 改变 Silvermoon CLI、schema、world revision、derived state、repository hygiene 或 lifecycle
  的运行时行为。
- 重新设计顶部主视觉或 `silvermoon-avatar.svg`，以及新增另一套品牌资产；本 idea 只改变
  现有文档资源的归属和引用路径。
- 撰写《凡人修仙传》剧情、人物考据或扩展世界设定；原作背景只服务于项目命名和器灵隐喻。
- 嵌入、下载、转载或摘录动画内容，以及暗示 Silvermoon 项目与小说、动画或其官方平台存在
  隶属、授权或背书关系。
- 为迁入 `docs/` 的文章提供中文翻译；本 idea 只要求中英文 README 双语同构，`docs/` 使用
  英文。
- 把 README 变成完整协议规范、维护者手册或所有命令选项的替代参考。

## Constraints

- README 必须保持读者优先：顶部品牌区之后先让用户开始使用，再逐步解释问题、人物和世界观。
- Quick Start 必须是可执行的最短 happy path，并保留 Node.js、Git access 等实际前置条件；
  不以省略必要条件换取表面简短。
- 世界观应有哲学意味但不能晦涩。每个文学或哲学表达都必须能对应明确的工程含义，未读过
  《凡人修仙传》的读者也应独立理解产品。
- 人物小传使用主流英文译名 `jade scepter` 与 `Bamboo Cloudswarm Swords`；“狼首”在英文中
  作为描述性修饰 `wolf-headed`，不虚构新的固定专名。英文身份表述使用正文可证实的
  `the Silvermoon Wolf Clan in the Spirit Realm` 和 `one of the split souls of Ling Long`，
  不依赖二手资料中不稳定的头衔译法。
- 动画入口只作为人物小传后的可选延伸阅读，使用描述性平台名称和外部链接，不复制受版权
  保护的内容，不影响未看过原作或无法访问相应平台的读者理解项目。
- README 不重复 docs 中的完整规范；docs 也不复制两份相互竞争的权威说明。迁移内容时必须
  保留现有行为保证和重要限制。
- 文档体系应按读者意图组织，但避免把一个过长 README 机械拆成大量零碎页面。
- 中英文 README 的标题层级、主要内容和链接目的保持对应，同时允许自然语言表达而非逐句
  直译。
- `docs/assets/` 只存放文档呈现所需的资源；若未来出现运行时或其他非文档消费者，应为其选择
  与职责相符的位置，而不是把 `docs/` 当作通用资源目录。
- 所有相对链接和图片必须同时考虑仓库浏览与 npm package 渲染；README 链接的 docs 与
  `docs/assets/` 中对应资源必须实际进入发布包。
