# Ledger

## Implementation

### Implementation steps

- [x] **I-S01:** 拆分三个 JSON Schema 文件
- [x] **I-S02:** 建立相对 references 与 published IDs
- [x] **I-S03:** 编译并验证两个公开入口
- [x] **I-S04:** 更新文档与 package checks
- [x] **I-S05:** 删除旧 schema 路径
- [x] **I-S06:** 运行完整 candidate validation

### Implementation acceptance criteria

- [x] **I-AC01:** Config 独立根 schema
- [x] **I-AC02:** Idea status 独立根 schema
- [x] **I-AC03:** 统一 schema 文件名与共享定义
- [x] **I-AC04:** 相对 references 可解析
- [x] **I-AC05:** 正反例与 runtime helper 一致性
- [x] **I-AC06:** README 公开入口与 runtime 边界
- [x] **I-AC07:** Package contents 与 installed smoke
- [x] **I-AC08:** 清除当前旧 schema references
- [x] **I-AC09:** 不改变 YAML 与配置 contract
- [x] **I-AC10:** Repository validation 通过

## Deployment

### Deployment steps

- [x] **D-S01:** 读取三个公开 raw schema
- [x] **D-S02:** 验证 JSON 与 published IDs
- [x] **D-S03:** 验证共享 definitions references
- [x] **D-S04:** 验证旧 schema 路径不存在
- [x] **D-S05:** 验证 authoritative remote history

### Deployment acceptance criteria

- [x] **D-AC01:** Config schema 公开可读取
- [x] **D-AC02:** Idea status schema 公开可读取
- [x] **D-AC03:** Definitions schema 公开可读取
- [x] **D-AC04:** 两个入口共享 definitions reference
- [x] **D-AC05:** 旧 schema 路径已移除
- [x] **D-AC06:** Package checks 覆盖新 schema
- [x] **D-AC07:** Remote check 验证当前 history
- [x] **D-AC08:** 未触发 npm publish
