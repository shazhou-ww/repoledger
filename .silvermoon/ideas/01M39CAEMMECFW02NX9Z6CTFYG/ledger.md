# Ledger

## Implementation

### Implementation steps

- [x] **I-S01:** 建立规范语言 tag 与全局配置基础设施
- [x] **I-S02:** 扩展项目与 idea 的 v1 存储契约
- [x] **I-S03:** 解析有效语言并接入 whats-next
- [x] **I-S04:** 为 create-idea 增加单次 language override
- [x] **I-S05:** 更新文档、技能和发布内容

### Implementation acceptance criteria

- [x] **I-AC01:** 三层存储契约兼容且严格
- [x] **I-AC02:** 解析优先级、来源和动态继承可证明
- [x] **I-AC03:** whats-next 的 JSON、文本和 action guidance 一致
- [x] **I-AC04:** create-idea override 只在显式请求时持久化
- [x] **I-AC05:** 仓库与发布验证全部通过

## Deployment

### Deployment steps

- [ ] **D-S01:** Build and inspect the package artifact
- [ ] **D-S02:** Exercise installed-package language resolution
- [ ] **D-S03:** Exercise installed create-idea overrides
- [ ] **D-S04:** Confirm primary health and remove temporary state

### Deployment acceptance criteria

- [ ] **D-AC01:** The packed consumer surface is complete
- [ ] **D-AC02:** Installed resolution is layered, explainable, and dynamic
- [ ] **D-AC03:** Installed creation preserves override boundaries
- [ ] **D-AC04:** Verification is externally healthy and leaves no residue
