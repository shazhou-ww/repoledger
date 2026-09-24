# Deployment

## Steps

### D-S01: 在 GitHub 与徽章目标页面核验外部呈现

在变更发布到项目主分支后，检查 GitHub README 的实际渲染效果，并逐一访问徽章
目标，确认公开读者可以看到四张有效图片，三个 npm 徽章进入 Silvermoon 的
npmx 包详情页，CI 徽章进入 `main` 分支的 CI workflow 运行列表。

## Acceptance criteria

### D-AC01: npm package 徽章在公开 README 中清晰且可信

公开 GitHub README 在桌面与窄屏视口中均按规定顺序清晰展示 npm version、
Node.js engine、npm unpacked size 和 CI 四枚徽章，徽章值与各详情页相符且全部
链接可达；通过浏览已发布 README、检查两种视口、访问全部徽章链接并对照页面
数据证明。
