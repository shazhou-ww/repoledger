# Implementation

## Steps

### I-S01: 配置 README 顶部的 npm package 徽章

在 `README.md` 的项目图像与语言切换入口之间增加一个居中的 HTML 段落，按
Badge specification 的固定顺序放置 npm version、Node.js engine、npm unpacked
size 与 CI 四枚可点击徽章。图片使用规定的 Shields.io `flat-square` 端点，
npm 徽章链接到 npmx 包详情，CI 徽章链接到 `main` 分支 workflow 运行列表；
保留其余顶部内容和正文结构。

## Acceptance criteria

### I-AC01: README 源码表达完整且可验证的徽章区域

`README.md` 在规定位置、按规定顺序包含恰好四枚徽章，图片端点、目标链接、
`flat-square` 样式和替代文本均与 Badge specification 一致，且没有无关正文
变更；通过审查 diff、请求四个图片端点确认返回有效 SVG、运行仓库 Markdown
链接检查和 `git diff --check` 证明。
