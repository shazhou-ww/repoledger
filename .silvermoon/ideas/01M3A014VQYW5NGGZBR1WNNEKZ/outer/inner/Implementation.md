# 实现

## 步骤

### I-S01: 生成绑定精确提交的 npm README

扩展发布准备逻辑，以仓库中的 `README.md` 为唯一源文件，确定性地生成供 npm
打包的 README。生成结果必须把语言切换、仓库文档和图片引用改写为
`shazhou-ww/silvermoon` 中发布提交的完整 Git 对象 ID；不得引用 `main`、
`HEAD` 或其他可移动引用。普通仓库检出中的 README 保持适合浏览和编辑的现有
形式，生成过程不得改写道心或从网络下载内容。

### I-S02: 准备 Silvermoon 0.0.2 软件包

将 `package.json` 和锁文件中的项目版本同步升级为 `0.0.2`，保持包名、
公开 npm 注册表、文件白名单、Node.js 要求和现有命令行入口不变。确保
`npm/silvermoon/v0.0.2` 能被发布规划器唯一映射到根目录的 `silvermoon`
软件包和 `latest` dist-tag。

### I-S03: 将 README 生成纳入受保护发布路径

在 `.github/workflows/publish-npm.yml` 中，于发布指令、提交可达性和 npm
版本未发布检查通过后生成发布 README，并让后续 tarball 检查、安装测试和
`npm publish` 使用同一份生成结果。为生成器、工作流顺序和包内容增加单元、
契约或集成覆盖；错误的提交、无法识别的链接或生成失败必须显式终止发布，
不得回退到可移动引用。

### I-S04: 验证精确发布候选

在创建发布标签前，对同一候选提交运行完整 `pnpm check`、发布规划器、
tarball 内容检查和全新安装 E2E。检查生成后的 README 不含可移动仓库引用，
tarball 仅包含白名单文件，安装后的 `silvermoon --help` 与
`silvermoon --version` 正常，并确认 npm 上尚不存在 `silvermoon@0.0.2`。

## 验收标准

### I-AC01: npm README 只解析到不可变发布快照

给定完整发布提交 ID，生成器输出保留当前“读者优先”内容，并将语言切换、
文档和图片全部解析到该提交；输出中不存在指向 `main`、`HEAD` 的仓库资源
引用或未处理的相对仓库链接。通过生成器自动化测试和对打包后 README 的断言
证明，同时确认源 `README.md` 在生成前后没有内容变化。

### I-AC02: 0.0.2 元数据与发布指令严格一致

提交中的包版本和锁文件版本均为 `0.0.2`，发布规划器对
`npm/silvermoon/v0.0.2` 返回包 `silvermoon`、根目录和 `latest`，并继续
拒绝版本不一致、提交不在 `origin/main`、版本已发布或注册表检查失败的候选。
通过发布规划器的聚焦测试和针对精确候选提交的命令输出证明。

### I-AC03: 受保护工作流发布经过验证的同一份内容

发布工作流在任何打包、安装测试或发布步骤之前完成不可变 README 生成，且
后三者使用相同的软件包目录；工作流仍仅使用 GitHub OIDC 可信发布，不引入
npm 写入令牌或本地发布路径。通过发布工作流契约测试和对
`.github/workflows/publish-npm.yml` 的结构断言证明。

### I-AC04: 发布候选通过完整仓库与安装验证

精确候选通过 `pnpm check`、`npm run pack:check` 和已安装软件包 E2E；
tarball 文件集合符合白名单，生成后的 README 与候选提交一致，干净安装后的
CLI 报告版本 `0.0.2` 并正常展示帮助。通过命令退出码、测试结果和
`npm pack --dry-run --json` 输出证明。
