# 移除需验证状态 + 移除人工审核功能 - 验收清单

## 阶段一：UI 清理

- [x] [app/admin/problems/page.tsx](file:///e:/桌面/oj/app/admin/problems/page.tsx) 全文搜"需验证" 0 处
- [x] [app/admin/problems/page.tsx](file:///e:/桌面/oj/app/admin/problems/page.tsx) 全文搜"已验证" 0 处
- [x] [app/admin/problems/page.tsx](file:///e:/桌面/oj/app/admin/problems/page.tsx) 全文搜"标程未验证" 0 处
- [x] [app/admin/problems/page.tsx](file:///e:/桌面/oj/app/admin/problems/page.tsx) 全文搜"验证中" 0 处（PENDING badge 已删除）
- [x] [app/admin/problems/page.tsx](file:///e:/桌面/oj/app/admin/problems/page.tsx) 全文搜 `aiStatus === 'VERIFIED'` 0 处
- [x] [app/admin/problems/page.tsx](file:///e:/桌面/oj/app/admin/problems/page.tsx) 全文搜 `aiStatus === 'AUTO_PUBLISHED_WITH_FAILURES'` 0 处
- [x] [app/admin/problems/page.tsx](file:///e:/桌面/oj/app/admin/problems/page.tsx) 保留"AI辅助"/"AI出题"类型标签
- [x] [app/admin/problems/page.tsx](file:///e:/桌面/oj/app/admin/problems/page.tsx) 保留"草稿"/"强制公开" badge
- [x] [components/AdminLayout.tsx](file:///e:/桌面/oj/components/AdminLayout.tsx) 全文搜"题目审核" 0 处
- [x] [components/AdminLayout.tsx](file:///e:/桌面/oj/components/AdminLayout.tsx) 全文搜"/admin/problems/review" 0 处
- [x] [components/AdminLayout.tsx](file:///e:/桌面/oj/components/AdminLayout.tsx) 删除 `CheckCircle` import
- [ ] 目录 `app/admin/problems/review/` **未删除**（用户取消操作）

## 阶段二：后端 API 删除

- [ ] 文件 `app/api/admin/problems/review/route.ts` **未删除**（用户取消操作）
- [ ] 文件 `app/api/admin/problems/[id]/verify/route.ts` **未删除**（用户取消操作）

## 阶段三：Prisma Schema 清理

- [x] [prisma/schema.prisma](file:///e:/桌面/oj/prisma/schema.prisma) `Problem` 模型无 `isVerified` 字段
- [x] [prisma/schema.prisma](file:///e:/桌面/oj/prisma/schema.prisma) `Problem` 模型无 `verifiedAt` 字段
- [x] [prisma/schema.prisma](file:///e:/桌面/oj/prisma/schema.prisma) `Problem` 模型无 `judgeStatus` 字段
- [x] [prisma/schema.prisma](file:///e:/桌面/oj/prisma/schema.prisma) `Problem` 模型无 `judgeMessage` 字段
- [x] [prisma/schema.prisma](file:///e:/桌面/oj/prisma/schema.prisma) `Problem` 模型无 `fixAttempts` 字段
- [x] [prisma/schema.prisma](file:///e:/桌面/oj/prisma/schema.prisma) `Solution` 模型无 `verified` 字段
- [x] [prisma/schema.prisma](file:///e:/桌面/oj/prisma/schema.prisma) `Solution` 模型无 `verifiedAt` 字段
- [ ] `npx prisma generate` **待用户执行**
- [ ] `npx prisma db push` **待用户执行**（MongoDB 字段同步）

## 阶段四：代码引用清理

### types/models.ts
- [x] [types/models.ts](file:///e:/桌面/oj/types/models.ts) `Problem` 接口无 `isVerified`

### app/admin/problems/page.tsx
- [x] `Problem` interface 同步删除上述 5 个字段

### 其他前端文件
- [x] [app/admin/problems/[id]/testcases/page.tsx](file:///e:/桌面/oj/app/admin/problems/[id]/testcases/page.tsx) 全文搜"isVerified" 0 处
- [x] [app/admin/problems/[id]/testcases/page.tsx](file:///e:/桌面/oj/app/admin/problems/[id]/testcases/page.tsx) 全文搜"setIsVerified" 0 处
- [x] [app/admin/problems/[id]/testcases/page.tsx](file:///e:/桌面/oj/app/admin/problems/[id]/testcases/page.tsx) "标记为已验证"提示已删除
- [x] [app/admin/problems/source/page.tsx](file:///e:/桌面/oj/app/admin/problems/source/page.tsx) 全文搜"验证状态" 0 处
- [x] [app/admin/problems/source/page.tsx](file:///e:/桌面/oj/app/admin/problems/source/page.tsx) "已验证" tag 已删除
- [x] [app/admin/problems/source/page.tsx](file:///e:/桌面/oj/app/admin/problems/source/page.tsx) "验证状态" 顶部描述已删除
- [x] [app/admin/problems/source/page.tsx](file:///e:/桌面/oj/app/admin/problems/source/page.tsx) 全文搜"isVerified" 0 处

### 后端 API
- [x] [app/api/admin/problems/route.ts](file:///e:/桌面/oj/app/api/admin/problems/route.ts) 全文搜"isVerified" 0 处
- [x] [app/api/admin/problems/route.ts](file:///e:/桌面/oj/app/api/admin/problems/route.ts) 全文搜"verifiedAt" 0 处
- [x] [app/api/admin/problems/route.ts](file:///e:/桌面/oj/app/api/admin/problems/route.ts) 全文搜"judgeStatus" 0 处
- [x] [app/api/admin/problems/route.ts](file:///e:/桌面/oj/app/api/admin/problems/route.ts) 全文搜"judgeMessage" 0 处
- [x] [app/api/admin/problems/route.ts](file:///e:/桌面/oj/app/api/admin/problems/route.ts) 全文搜"fixAttempts" 0 处
- [x] [app/api/admin/problems/[id]/route.ts](file:///e:/桌面/oj/app/api/admin/problems/[id]/route.ts) AI 公开前的 isVerified 校验已简化
- [x] [app/api/admin/problems/export/route.ts](file:///e:/桌面/oj/app/api/admin/problems/export/route.ts) 全文搜"isVerified" 0 处
- [x] [app/api/problems/[id]/route.ts](file:///e:/桌面/oj/app/api/problems/[id]/route.ts) 全文搜"isVerified" 0 处

### lib/ai/queue.ts
- [x] [lib/ai/queue.ts](file:///e:/桌面/oj/lib/ai/queue.ts) 全文搜"isVerified" 0 处

## 阶段五：测试更新

- [x] [scripts/test-3-static-page.ts](file:///e:/桌面/oj/scripts/test-3-static-page.ts) 新增「需验证」反向断言
- [x] [scripts/test-3-static-page.ts](file:///e:/桌面/oj/scripts/test-3-static-page.ts) 新增「已验证」反向断言
- [x] [scripts/test-3-static-page.ts](file:///e:/桌面/oj/scripts/test-3-static-page.ts) 新增「标程未验证」反向断言
- [x] [scripts/test-3-static-page.ts](file:///e:/桌面/oj/scripts/test-3-static-page.ts) 新增「验证中」反向断言
- [x] [scripts/test-3-static-page.ts](file:///e:/桌面/oj/scripts/test-3-static-page.ts) 新增 aiStatus VERIFIED/AUTO_PUBLISHED_WITH_FAILURES 渲染分支反向断言
- [x] [scripts/test-3-static-page.ts](file:///e:/桌面/oj/scripts/test-3-static-page.ts) 新增「题目审核」反向断言
- [x] [scripts/test-3-static-page.ts](file:///e:/桌面/oj/scripts/test-3-static-page.ts) 新增 source/page.tsx「验证状态」反向断言
- [x] [scripts/test-3-static-page.ts](file:///e:/桌面/oj/scripts/test-3-static-page.ts) 新增 testcases/page.tsx `isVerified` 反向断言
- [x] [scripts/test-3-static-page.ts](file:///e:/桌面/oj/scripts/test-3-static-page.ts) 新增 Prisma schema 字段删除反向断言
- [x] [scripts/test-3-static-page.ts](file:///e:/桌面/oj/scripts/test-3-static-page.ts) 新增 ai-generation/page.tsx 字段引用反向断言

## 阶段六：验证

- [x] `npx tsc --noEmit` 0 错误
- [x] `npx tsx scripts/test-1-parser.ts` 21/21 通过
- [x] `npx tsx scripts/test-2-normalize.ts` 15/15 通过
- [x] `npx tsx scripts/test-3-static-page.ts` 40/40 通过

## 端到端手工验证（待用户执行）

- [ ] 重启 dev server
- [ ] 访问 `/admin/problems` → 看到题目列表，**无**任何"需验证"/"已验证"/"标程未验证" badge
- [ ] 侧边栏中**无**"题目审核"菜单项
- [ ] 触发一次 AI 出题 → 完成后题目在 admin/problems 列表中**无**任何验证状态徽章

## 已知差异（用户决定）

以下 3 个文件**未删除**（用户在实施过程中取消了删除操作）：
- `e:\桌面\oj\app\admin\problems\review\page.tsx`（review 页面）
- `e:\桌面\oj\app\api\admin\problems\review\route.ts`（review API 路由）
- `e:\桌面\oj\app\api\admin\problems\[id]\verify\route.ts`（verify API 路由）

这些文件目前是孤儿代码（无 UI 入口，无业务调用方），但仍然存在。如需后续删除，请手动执行。

## 代码质量

- [x] 改动集中在 4 个领域：UI badge、Prisma schema、类型定义、业务文件
- [x] 没有任何"半删半留"的状态
- [x] AI 生成的题目在 list 中显示为正常公开题目，**不带**任何验证状态标记
