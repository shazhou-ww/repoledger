# Ledger

## Implementation

### Steps

- [x] **I-S01:** 定义集中维护的默认模板
- [x] **I-S02:** 扩展 create-idea scaffold
- [x] **I-S03:** 将 ledger 收紧为必需 layout
- [x] **I-S04:** 迁移现有 idea
- [x] **I-S05:** 更新 Agent authoring workflow
- [x] **I-S06:** 对齐公开文档与 package surface
- [x] **I-S07:** 更新并扩充回归测试

### Acceptance criteria

- [x] **I-AC01:** 新 scaffold 包含完整结构
- [x] **I-AC02:** Ledger 是所有 idea 的必需文件
- [x] **I-AC03:** World contract 支持逐项细化
- [x] **I-AC04:** AC 自包含证明方法
- [x] **I-AC05:** Ledger 同步规则明确且不越过 decision boundary
- [x] **I-AC06:** Ledger 保持 revision isolation
- [x] **I-AC07:** 当前仓库完成直接迁移
- [x] **I-AC08:** 完整验证通过

## Deployment

### Steps

- [ ] **D-S01:** 验证 fresh repository 创建流程
- [ ] **D-S02:** 验证必需 ledger 的拒绝与迁移路径
- [ ] **D-S03:** 验证 Agent continuation 行为
- [ ] **D-S04:** 验证 package 与共享主分支候选

### Acceptance criteria

- [ ] **D-AC01:** 已安装 CLI 生成相同 scaffold
- [ ] **D-AC02:** 真实仓库不接受缺失 ledger
- [ ] **D-AC03:** Agent 能从双阶段 ledger 继续工作
- [ ] **D-AC04:** Lifecycle 与 ledger 状态保持隔离
- [ ] **D-AC05:** 发布候选表面一致
