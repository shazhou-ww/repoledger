# 账本

## 实现

### Implementation steps

- [x] **I-S01:** 生成绑定精确提交的 npm README
- [x] **I-S02:** 准备 Silvermoon 0.0.2 软件包
- [x] **I-S03:** 将 README 生成纳入受保护发布路径
- [x] **I-S04:** 验证精确发布候选

### Implementation acceptance criteria

- [x] **I-AC01:** npm README 只解析到不可变发布快照
- [x] **I-AC02:** 0.0.2 元数据与发布指令严格一致
- [x] **I-AC03:** 受保护工作流发布经过验证的同一份内容
- [x] **I-AC04:** 发布候选通过完整仓库与安装验证

## 部署

### Deployment steps

- [x] **D-S01:** 通过受保护工作流发布并验证 npm 注册表状态
- [x] **D-S02:** 处置 0.0.2 发布事故并以 0.0.3 完成发布

### Deployment acceptance criteria

- [x] **D-AC01:** npm 注册表提供 README 正确的最新稳定版本
- [x] **D-AC02:** 发布经过可信工作流且安装行为正确
