# 在 README 顶部展示 npm package badges

## Intent

让访问项目 README 的读者在进入正文前即可看到一组适合 npm package
的状态徽章，并能通过徽章前往对应的权威详情页。

## Context

当前 `README.md` 顶部展示了项目图像和语言切换入口，但没有概览 npm
包状态。读者若想确认最新版本、运行时要求、安装体积或持续集成状态，需要自行
在 README、package metadata、npm registry 和 GitHub Actions 之间查找。

当前包的公开事实也限制了徽章选择：

- npm 已发布版本为 `0.0.1`，`engines.node` 为 `>=22`。
- npm unpacked size 可由 registry 数据稳定计算。
- `.github/workflows/ci.yml` 会在 push、pull request 和手动触发时运行。
- npm 月下载量端点目前返回 `package not found or too new`，不适合作为正面状态。
- package license 为 `UNLICENSED`，不应展示容易让读者误解为开源许可的徽章。

## Desired outcome

`README.md` 顶部在项目图像与语言切换入口之间增加一行居中的四枚实时徽章，
依次展示 npm 最新版本、Node.js engine、npm unpacked size 和 `main` 分支 CI
状态。徽章图片统一由 Shields.io 提供 `flat-square` 样式，数据分别来自 npm
registry 与 GitHub Actions，不在 README 中复制会过期的静态值。

前三枚 npm package 徽章点击后进入稳定的
`https://npmx.dev/package/silvermoon` 包详情页，CI 徽章点击后进入仓库的
`ci.yml` workflow 页面。读者可以从徽章快速获取状态，也可以继续进入相应详情
页面核验。

## Badge specification

| 顺序 | 含义 | Shields.io 图片端点 | 点击目标 |
| --- | --- | --- | --- |
| 1 | npm 最新版本 | `https://img.shields.io/npm/v/silvermoon?style=flat-square` | `https://npmx.dev/package/silvermoon` |
| 2 | Node.js engine | `https://img.shields.io/node/v/silvermoon?style=flat-square` | `https://npmx.dev/package/silvermoon` |
| 3 | npm unpacked size | `https://img.shields.io/npm/unpacked-size/silvermoon?style=flat-square` | `https://npmx.dev/package/silvermoon` |
| 4 | `main` 分支 CI | `https://img.shields.io/github/actions/workflow/status/shazhou-ww/silvermoon/ci.yml?branch=main&style=flat-square&label=CI` | `https://github.com/shazhou-ww/silvermoon/actions/workflows/ci.yml?query=branch%3Amain` |

README 使用与现有顶部区域一致的 HTML `<p align="center">` 容器，并为四张图片
分别提供 `npm version`、`Node.js version`、`npm unpacked size` 和
`CI status` 替代文本。

## Scope

### In scope

- 按 Badge specification 在 `README.md` 项目图像之后增加居中的徽章区域。
- 使用 Shields.io 呈现由 npm registry 和 GitHub Actions 驱动的动态状态。
- 为每枚徽章提供规定的目标链接和可理解的替代文本。
- 保持现有顶部项目图像、语言入口和正文层级的可读性。

### Out of scope

- 改变 npm 包的版本、许可证、Node.js 支持范围或发布流程。
- 为了获得某种徽章状态而修改持续集成工作流。
- 在当前端点不能提供有效数据时展示 npm 下载量徽章。
- 展示 license、dependencies、coverage、stars 或其他未列入规范的徽章。
- 重写 README 正文或调整项目品牌图像。
- 同步修改 `README.zh-CN.md`；中文 README 的徽章安排可另行决定。

## Constraints

- 徽章必须使用上述动态端点反映真实、当前且可核验的项目状态，不使用手工静态值。
- 徽章数量固定为四枚，顺序固定，在常见桌面与窄屏宽度下均应保持清晰。
- 所有图片与链接应使用公开、稳定的 HTTPS 地址，不引入仓库密钥或私有服务依赖。
- 现有 README 内容和 npm package 行为保持不变。
