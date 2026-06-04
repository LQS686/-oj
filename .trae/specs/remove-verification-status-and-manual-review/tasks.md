# 移除需验证状态 + 移除人工审核功能 - 任务清单

## 任务总览

按 6 个阶段推进：UI 清理 → 后端 API 删除 → Schema 清理 → 代码引用清理 → 测试更新 → 验证。

## 阶段一：UI 清理

### 任务 1: 移除题目列表的"需验证"/"已验证"/"标程未验证" badge [app/admin/problems/page.tsx](file:///e:/桌面/oj/app/admin/problems/page.tsx)
- [x] 1.1: 移除「需验证」红色 badge（条件：aiStatus === 'AI_GENERATED' && !isVerified）
- [x] 1.2: 移除「已验证」绿色 badge（条件：aiStatus === 'VERIFIED'）
- [x] 1.3: 移除「标程未验证」橙色 badge（条件：aiStatus === 'AUTO_PUBLISHED_WITH_FAILURES'）
- [x] 1.4: 移除详情弹窗中的「验证时间」「判定结果」「自动修正次数」「错误信息」4 个 div 块 + VERIFIED/AUTO_PUBLISHED_WITH_FAILURES/PENDING badge
- [x] 1.5: 保留"AI辅助"/"AI出题"类型标签 + "草稿"/"强制公开" badge（这些不是验证状态）

### 任务 2: 移除侧边栏"题目审核"菜单项 [components/AdminLayout.tsx](file:///e:/桌面/oj/components/AdminLayout.tsx)
- [x] 2.1: 删除「题目审核」菜单对象
- [x] 2.2: 删除 `CheckCircle` icon import（不再被使用）
- [x] 2.3: 确认无其他文件 import 该菜单项

### 任务 3: 删除 review 页面 [app/admin/problems/review/](file:///e:/桌面/oj/app/admin/problems/review/)
- [ ] 3.1: ~~删除整个目录 `app/admin/problems/review/`~~ **用户取消删除**（用户要求保留这些文件）

## 阶段二：后端 API 删除

### 任务 4: 删除 review 路由 [app/api/admin/problems/review/route.ts](file:///e:/桌面/oj/app/api/admin/problems/review/route.ts)
- [ ] 4.1: ~~删除文件 `app/api/admin/problems/review/route.ts`~~ **用户取消删除**

### 任务 5: 删除 verify 路由 [app/api/admin/problems/[id]/verify/route.ts](file:///e:/桌面/oj/app/api/admin/problems/[id]/verify/route.ts)
- [ ] 5.1: ~~删除文件 `app/api/admin/problems/[id]/verify/route.ts`~~ **用户取消删除**

## 阶段三：Prisma Schema 清理

### 任务 6: 删除 Problem 字段 [prisma/schema.prisma](file:///e:/桌面/oj/prisma/schema.prisma)
- [x] 6.1: 删除 `isVerified Boolean @default(true)`
- [x] 6.2: 删除 `verifiedAt DateTime?`
- [x] 6.3: 删除 `judgeStatus String?`
- [x] 6.4: 删除 `judgeMessage String?`
- [x] 6.5: 删除 `fixAttempts Int @default(0)`

### 任务 7: 删除 Solution 字段 [prisma/schema.prisma](file:///e:/桌面/oj/prisma/schema.prisma)
- [x] 7.1: 删除 `verified Boolean @default(false)`
- [x] 7.2: 删除 `verifiedAt DateTime?`

### 任务 8: 同步 Prisma 客户端
- [ ] 8.1: `npx prisma generate` （**待用户自行执行**）
- [ ] 8.2: `npx prisma db push` （**待用户自行执行**）

## 阶段四：代码引用清理

### 任务 9: 清理 types/models.ts [types/models.ts](file:///e:/桌面/oj/types/models.ts)
- [x] 9.1: Problem 类型删除 `isVerified?: boolean`

### 任务 10: 清理 page.tsx Problem interface [app/admin/problems/page.tsx](file:///e:/桌面/oj/app/admin/problems/page.tsx)
- [x] 10.1: Problem interface 同步删除上述 5 个字段

### 任务 11: 清理其他前端引用
- [x] 11.1: [app/admin/problems/[id]/testcases/page.tsx](file:///e:/桌面/oj/app/admin/problems/[id]/testcases/page.tsx) 移除 `isVerified` / `setIsVerified` 本地 state + "标记为已验证"提示
- [x] 11.2: [app/admin/problems/source/page.tsx](file:///e:/桌面/oj/app/admin/problems/source/page.tsx) 移除"验证状态"列 + "已验证" tag + 顶部"验证状态"描述

### 任务 12: 清理后端 API 响应
- [x] 12.1: [app/api/admin/problems/route.ts](file:///e:/桌面/oj/app/api/admin/problems/route.ts) 查询与响应中删除 `isVerified` 等 5 个字段
- [x] 12.2: [app/api/admin/problems/[id]/route.ts](file:///e:/桌面/oj/app/api/admin/problems/[id]/route.ts) 简化 AI 公开前的 isVerified 校验
- [x] 12.3: [app/api/admin/problems/export/route.ts](file:///e:/桌面/oj/app/api/admin/problems/export/route.ts) 导出字段删除
- [x] 12.4: [app/api/problems/[id]/route.ts](file:///e:/桌面/oj/app/api/problems/[id]/route.ts) 解构中删除

### 任务 13: 清理 AI 出题入库 [lib/ai/queue.ts](file:///e:/桌面/oj/lib/ai/queue.ts)
- [x] 13.1: 删除测试数据入库时的 `isVerified: true`
- [x] 13.2: 删除 AI 出题 prisma.problem.create 时的 `isVerified: true`

## 阶段五：测试更新

### 任务 14: 更新 test-3-static-page.ts [scripts/test-3-static-page.ts](file:///e:/桌面/oj/scripts/test-3-static-page.ts)
- [x] 14.1: 新增反向断言「需验证」「已验证」「标程未验证」「验证中」不应再出现
- [x] 14.2: 新增反向断言 aiStatus === 'VERIFIED' / 'AUTO_PUBLISHED_WITH_FAILURES' 渲染分支不应再出现
- [x] 14.3: 新增反向断言「题目审核」菜单项不应再出现
- [x] 14.4: 新增反向断言 source/page.tsx 无「验证状态」列
- [x] 14.5: 新增反向断言 testcases/page.tsx 无 `isVerified` 本地 state
- [x] 14.6: 新增反向断言 Prisma schema 已移除 5 个字段
- [x] 14.7: 新增反向断言 ai-generation/page.tsx 不引用这些字段

## 阶段六：验证

### 任务 15: 跑全套测试
- [x] 15.1: `npx tsc --noEmit` 0 错误
- [x] 15.2: `npx tsx scripts/test-1-parser.ts` 21/21 通过
- [x] 15.3: `npx tsx scripts/test-2-normalize.ts` 15/15 通过
- [x] 15.4: `npx tsx scripts/test-3-static-page.ts` 40/40 通过（含新反向断言）

## 已知差异（用户决定）

以下 3 个文件**未删除**（用户在实施过程中取消了删除操作）：
- `e:\桌面\oj\app\admin\problems\review\page.tsx`（review 页面）
- `e:\桌面\oj\app\api\admin\problems\review\route.ts`（review API 路由）
- `e:\桌面\oj\app\api\admin\problems\[id]\verify\route.ts`（verify API 路由）

这些文件目前是孤儿代码（无 UI 入口，无业务调用方），但仍然存在。如需后续删除，请手动执行。

## 任务依赖关系

```
任务1,2 (UI 清理) — 独立 ✅
任务3 (review 页面删除) — 用户取消 ⏸️
任务4,5 (API 删除) — 用户取消 ⏸️
任务6,7,8 (Schema) — 顺序 ✅（8 待用户执行）
任务9-13 (代码引用清理) — 顺序 ✅
任务14,15 (测试 + 验证) — 收尾 ✅
```

## 完成标准

✅ 任务 1, 2, 6, 7, 9-15 全部完成（共 14 个勾选项）
⏸️ 任务 3, 4, 5 因用户取消未完成（3 个孤儿文件保留）
⏸️ 任务 8 待用户自行运行 `npx prisma generate` + `npx prisma db push`

**TypeScript 0 错误，4 个测试脚本全部通过（含 10 个新增反向断言）。**
