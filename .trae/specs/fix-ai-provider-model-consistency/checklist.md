# Checklist - AI服务商/模型数据一致性修复

## 前端一致性
- [x] `app/admin/ai-models/page.tsx` 当 providers 为空时，模型卡片区域显示"暂无模型 — 请先添加 AI 服务商"
- [x] 添加服务商后模型卡片才会出现
- [x] 删除最后一个服务商后，其下所有模型卡片同步消失

## 后端 GET models
- [x] `app/api/admin/ai/models` 返回的 models 中，所有 model 都有有效 provider
- [x] 孤儿 model 不会出现在响应中
- [x] 即便 DB 中存在孤儿引用，API 不返回 500
- [x] 未授权请求返回 401/403

## 后端 DELETE provider
- [x] `app/api/admin/ai/providers/[id]` 删除时同时删除其下所有 models
- [x] API 返回 200 + `{ success: true }`
- [x] 日志记录级联删除的 model 数量

## 验证
- [x] `npx tsc --noEmit` 通过
- [x] `npm run lint` 未引入新错误
- [x] 关键路径覆盖：providers空时models空、删除provider级联清理
