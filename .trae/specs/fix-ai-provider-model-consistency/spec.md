# AI服务商/模型数据一致性修复规范

## Why
当前 AI 模型管理页面在以下场景存在数据不一致问题：

1. **页面状态不一致**：`app/admin/ai-models/page.tsx` 同时展示 "暂无服务商" 与具体模型（"deepseek-reasoner"）。当 providers 数组为空时，models 数组仍可能包含孤立模型记录，导致用户困惑。
2. **后端级联缺失**：`app/api/admin/ai/providers/[id]/route.ts` 的 DELETE 接口在有关联模型时直接返回 400 "Cannot delete provider with existing models"，要求用户先手动删除模型，不符合"删除服务商即清理其下所有模型"的预期。
3. **孤立模型数据**：数据库中可能存在 providerId 指向不存在 Provider 的模型记录（孤儿），GET models 接口的 `include: { provider }` 在 MongoDB 中遇到孤儿引用时可能抛错，导致 500。
4. **API 500 错误**：用户报告 `GET /api/admin/ai/providers 500` 与 `DELETE /api/admin/ai/models/... 500`，从现象看是孤儿关联或 prisma include 失败导致。

## What Changes

### 1. 前端：providers为空时隐藏models列表
- 在 `app/admin/ai-models/page.tsx` 的渲染逻辑中：当 `providers.length === 0` 时，强制将 `models` 视为空数组
- 显示"暂无模型"占位（与providers空状态一致）
- 添加"添加AI服务商后即可配置模型"提示文字

### 2. 后端 GET models：过滤孤儿模型
- 修改 `app/api/admin/ai/models/route.ts` 的 GET 接口
- 通过 `where: { provider: { is: { id: { not: undefined } } } }` 或 `provider: { isNot: null }` 过滤
- 对于无法过滤的孤儿模型，改用 `select` + 手动 include，避免 prisma 在 include 失败时抛 500

### 3. 后端 DELETE provider：级联删除关联模型
- 修改 `app/api/admin/ai/providers/[id]/route.ts` 的 DELETE 接口
- 删除前先 `prisma.aiModel.deleteMany({ where: { providerId: id } })`
- 然后再删除 provider 本身
- 不再返回 400 阻止删除

## Impact
- Affected specs: AI 管理
- Affected code:
  - `app/admin/ai-models/page.tsx` (UI 渲染)
  - `app/api/admin/ai/providers/[id]/route.ts` (DELETE 级联)
  - `app/api/admin/ai/models/route.ts` (GET 过滤)

## ADDED Requirements

### Requirement: 模型列表必须与服务商保持一致
当系统中不存在任何 AI 服务商时，AI 模型列表必须显示为空，且 UI 不再列出任何模型卡片。
- **Scenario**: 用户进入 AI 模型管理页，DB 中 providers 为空
- **THEN**: 模型卡片不显示，模型区域展示"暂无模型 — 请先添加 AI 服务商"占位

### Requirement: 删除服务商必须级联删除其下模型
调用 `DELETE /api/admin/ai/providers/[id]` 时，系统应先删除该服务商下的所有模型，再删除服务商本身，最终返回 200。
- **Scenario**: 服务商下存在 3 个模型
- **THEN**: 该 3 个模型被删除，服务商被删除，API 返回 `{ success: true }`

### Requirement: GET models 不返回孤立模型且不抛 500
`GET /api/admin/ai/models` 必须只返回 `providerId` 仍指向现存 Provider 的模型；若 include provider 失败，必须降级为 null 字段而非返回 500。
- **Scenario**: DB 中存在 providerId 指向不存在 Provider 的孤儿模型
- **THEN**: 该孤儿模型不出现在返回列表中（或以 provider=null 形式出现），API 不抛 500

## 技术细节

### 前端修复
```tsx
const effectiveModels = providers.length === 0 ? [] : models

// 在 models 渲染处
{effectiveModels.length === 0 ? (
  <div>
    <Cpu ... />
    <p>暂无模型</p>
    <p>添加 AI 服务商后即可配置模型</p>
  </div>
) : (
  ...
)}
```

### 后端 GET models 修复
```ts
const models = await prisma.aiModel.findMany({
  where: {
    provider: { is: { isActive: true } }
  },
  include: {
    provider: { select: { name: true, slug: true } }
  },
  orderBy: { createdAt: 'desc' }
})
```

如果 Prisma 在 MongoDB 上不支持 `where: { provider: ... }` 过滤，可改用两步查询：
```ts
const models = await prisma.aiModel.findMany({ orderBy: { createdAt: 'desc' } })
const providerIds = Array.from(new Set(models.map(m => m.providerId)))
const providers = await prisma.aiProvider.findMany({
  where: { id: { in: providerIds } },
  select: { id: true, name: true, slug: true }
})
const providerMap = new Map(providers.map(p => [p.id, p]))
const enriched = models
  .filter(m => providerMap.has(m.providerId))
  .map(m => ({ ...m, provider: providerMap.get(m.providerId) }))
return NextResponse.json({ success: true, data: enriched })
```

### 后端 DELETE provider 修复
```ts
// 先删除关联模型
await prisma.aiModel.deleteMany({ where: { providerId: id } })
// 再删除服务商
await prisma.aiProvider.delete({ where: { id } })
return NextResponse.json({ success: true })
```
