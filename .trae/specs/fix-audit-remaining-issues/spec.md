# 修复审计遗留问题与移除积分功能 Spec

## Why
全面审计（comprehensive-project-audit）记录了 6 个 tsc 预存在错误和 3 个 eslint 预存在 errors。这些错误阻塞 husky pre-commit hook（lint-staged 中的 tsc --noEmit），且其中包含一个引用不存在模块的积分功能路由。用户要求修复这些问题并完全移除积分相关功能。

## What Changes
- **完全移除积分功能**：移除 `@/lib/points/award` 引用、迁移脚本中的 points 集合名、rank 页面积分文案
- **修复 tsc 预存在错误（6 文件）**：
  - `app/api/admin/ai/solution/status/route.ts` — `logId` 类型收窄
  - `app/api/admin/announcements/route.ts` — `body.title`/`body.content` 类型收窄
  - `app/api/classes/[id]/notes/[noteId]/read/route.ts` — 移除积分引用，改用 `markClassNoteRead`
  - `app/classes/page.tsx`、`components/training/TrainingCard.tsx` — 移除 Lucide `title` prop
  - `lib/category/service.ts` + `app/api/categories/route.ts` — 移除未实现的 category 功能（schema 无 Category 模型，前端未引用）
- **修复 eslint 预存在 errors（3 项）**：
  - `hooks/useSubmissionSocket.ts` — 移除渲染期间 ref 访问
  - `scripts/e2e-ai-generation.ts` — `require()` 改为 `import`
- **BREAKING**: 移除 `/api/categories` 路由（未被前端使用，schema 无对应模型）

## Impact
- Affected code: `app/api/classes/[id]/notes/[noteId]/read/route.ts`、`scripts/migrate-team-to-class.ts`、`app/rank/page.tsx`、`lib/category/service.ts`、`app/api/categories/route.ts`、`hooks/useSubmissionSocket.ts`、`scripts/e2e-ai-generation.ts`、`app/api/admin/ai/solution/status/route.ts`、`app/api/admin/announcements/route.ts`、`app/classes/page.tsx`、`components/training/TrainingCard.tsx`

## ADDED Requirements
（无新增需求）

## MODIFIED Requirements
### Requirement: 笔记阅读记录
笔记阅读路由 SHALL 仅记录阅读历史（`markClassNoteRead`），不再触发积分发放。响应 SHALL 返回 `{ success: true }`，不再包含 `pointsAwarded` 字段。

### Requirement: 排行榜页面
排行榜页面 SHALL 使用 "Rating 排行榜" 标签，不再出现 "积分" 字样。

## REMOVED Requirements
### Requirement: 积分发放功能
**Reason**: 积分功能从未完整实现（`@/lib/points/award` 模块不存在），仅有一个路由引用导致 tsc 编译错误。用户要求完全移除。
**Migration**: 笔记阅读路由改为仅记录阅读历史，不再发放积分。无数据迁移需要（积分表从未创建）。

### Requirement: 分类（Category）API
**Reason**: `prisma.category` 模型在 schema 中不存在，`/api/categories` 路由从未正常工作（GET 靠 try/catch 回退到硬编码数据），前端未引用该 API。
**Migration**: 无需迁移，直接移除 `lib/category/service.ts` 和 `app/api/categories/route.ts`。
