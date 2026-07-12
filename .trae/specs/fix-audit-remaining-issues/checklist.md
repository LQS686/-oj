# Checklist

## 阶段一：积分功能移除
- [x] `app/api/classes/[id]/notes/[noteId]/read/route.ts` 不再引用 `@/lib/points/award`，改用 `markClassNoteRead`
- [x] `app/api/classes/[id]/notes/[noteId]/read/route.ts` 返回 `{ success: true }`，无 `pointsAwarded` 字段
- [x] `scripts/migrate-team-to-class.ts` 不含 points* 集合名
- [x] `app/rank/page.tsx` 不含 "积分" 字样

## 阶段二：tsc 错误修复
- [x] `app/api/admin/ai/solution/status/route.ts:31` — logId 类型收窄，无 TS2345
- [x] `app/api/admin/announcements/route.ts:29-30` — title/content 类型收窄，无 TS2322
- [x] `app/classes/page.tsx:575,577` — Lucide 图标无 title prop，无 TS2322
- [x] `components/training/TrainingCard.tsx:91` — Lucide 图标无 title prop，无 TS2322
- [x] `lib/category/service.ts` 和 `app/api/categories/route.ts` 已移除，无 TS2339

## 阶段三：eslint errors 修复
- [x] `hooks/useSubmissionSocket.ts:183` — 不在渲染期间访问 ref，无 react-hooks/refs error
- [x] `scripts/e2e-ai-generation.ts:19` — 无 require() 导入，无 no-require-imports error

## 阶段四：验证回归
- [x] `npx tsc --noEmit` 无错误（参考资源除外）
- [x] `npx eslint --quiet` 无 errors
- [x] `npx vitest run` 全部通过（91/91）
- [x] 修复未引入新的回归
