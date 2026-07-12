# Tasks

## 阶段一：移除积分功能

- [x] Task 1: 移除笔记阅读路由中的积分逻辑 — `app/api/classes/[id]/notes/[noteId]/read/route.ts` 移除 `awardNoteReadPoints` 引用，改用 `markClassNoteRead` 记录阅读历史，返回 `{ success: true }`。
- [x] Task 2: 清理积分相关引用 — `scripts/migrate-team-to-class.ts` 移除 points* 集合名；`app/rank/page.tsx` 将 "积分榜" 改为 "排行榜"。

## 阶段二：修复 tsc 预存在错误

- [x] Task 3: 修复类型收窄问题 — `app/api/admin/ai/solution/status/route.ts` 在 throw400 后加 return；`app/api/admin/announcements/route.ts` 用非空断言。
- [x] Task 4: 移除 Lucide title prop — `app/classes/page.tsx`、`components/training/TrainingCard.tsx` 将 Lucide 图标的 `title` prop 改用 `aria-label`。
- [x] Task 5: 移除未实现的 Category 功能 — 删除 `lib/category/service.ts` 和 `app/api/categories/route.ts`（schema 无 Category 模型，前端未引用）。

## 阶段三：修复 eslint 预存在 errors

- [x] Task 6: 修复 useSubmissionSocket ref 访问 — 移除返回值中的 `socket: socketRef.current`（无调用方使用）。
- [x] Task 7: 修复 e2e-ai-generation require 导入 — `require('dotenv').config()` 改为 `import 'dotenv/config'`。

## 阶段四：验证

- [x] Task 8: 全量验证 — 运行 `npx tsc --noEmit`、`npx eslint --quiet`、`npx vitest run`，确认所有预存在错误已修复且无新增。

# Task Dependencies
- Task 1-7 之间无强依赖，可并行执行
- Task 8 依赖 Task 1-7 完成
