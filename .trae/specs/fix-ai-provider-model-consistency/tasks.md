# Tasks - AI服务商/模型数据一致性修复

- [x] Task 1: 修复前端：providers为空时隐藏models列表
- [x] Task 2: 修复后端 GET models：过滤孤儿模型
- [x] Task 3: 修复后端 DELETE provider：级联删除关联模型
- [x] Task 4: 验证修复（TypeScript、lint、行为）

## 详细任务

### Task 1: 修复前端
- [x] 1.1: 在 `app/admin/ai-models/page.tsx` 引入 `effectiveModels = providers.length === 0 ? [] : models`
- [x] 1.2: 将渲染 models 的 `.map(models => ...)` 改为 `effectiveModels`
- [x] 1.3: 修改空状态文案为"暂无模型 — 请先添加 AI 服务商"
- [x] 1.4: 删除按钮仍可点（孤儿模型若出现可手动删除）

### Task 2: 修复后端 GET models
- [x] 2.1: 改写 `app/api/admin/ai/models/route.ts` GET：
  - 拉取所有 models
  - 拉取对应 providers (in ids)
  - 过滤 + enrich 后返回
- [x] 2.2: 验证孤儿模型不返回，include 不抛 500

### Task 3: 修复后端 DELETE provider
- [x] 3.1: 改写 `app/api/admin/ai/providers/[id]/route.ts` DELETE：
  - 先 `deleteMany` models
  - 再 `delete` provider
- [x] 3.2: 移除 "Cannot delete provider with existing models" 检查
- [x] 3.3: 添加 logger.info 记录级联删除数量

### Task 4: 验证
- [x] 4.1: `npx tsc --noEmit` 通过
- [x] 4.2: 关键路径手测（无 auth 情况下 curl 返回 401，不应 500）

## 任务依赖
- Task 2 和 Task 3 可并行
- Task 1 可与 Task 2/3 并行
- Task 4 依赖前三项
