# 移除需验证状态 + 移除人工审核功能

## Why

系统当前残留"AI 题目需人工验证"的概念与 UI：

1. **截图证据**：[app/admin/problems/page.tsx](file:///e:/桌面/oj/app/admin/problems/page.tsx#L574-L591) 仍展示"需验证"红 badge（P1008 / P1009 / P1012 / P1013 等老 AI 题目）
2. **业务决策（2026-06）早已生效**：[lib/ai/queue.ts](file:///e:/桌面/oj/lib/ai/queue.ts#L359-L365) 中新生成的 AI 题目已 `isPublic: true, isVerified: true, aiStatus: 'AI_GENERATED'`，无需人工审核
3. **侧边栏仍挂着入口**：[components/AdminLayout.tsx](file:///e:/桌面/oj/components/AdminLayout.tsx#L109-L113) 仍展示"题目审核"菜单 → [app/admin/problems/review/page.tsx](file:///e:/桌面/oj/app/admin/problems/review/page.tsx) 可访问
4. **后端路由仍是死代码**：
   - `app/api/admin/problems/review/route.ts` (获取待审核列表)
   - `app/api/admin/problems/[id]/verify/route.ts` (提交标程并验证)
5. **数据库字段**：`isVerified`, `verifiedAt`, `judgeStatus`, `judgeMessage`, `fixAttempts` 已无业务价值

**目标**：彻底移除"AI 题目需人工审核"概念 — 清理 UI badge、删除 review 页面、删除相关 API 路由、清理数据库 schema 字段。前端只剩"公开"与"隐藏"两个状态，AI 题目生成即自动公开。

## What Changes

### 1. 删除 UI 残留 badge（[app/admin/problems/page.tsx](file:///e:/桌面/oj/app/admin/problems/page.tsx)）

- **移除** line 574-579：「需验证」红色 badge（条件：`aiStatus === 'AI_GENERATED' && !isVerified`）
- **移除** line 580-585：「已验证」绿色 badge（条件：`aiStatus === 'VERIFIED'`）
- **移除** line 586-591：「标程未验证」橙色 badge（条件：`aiStatus === 'AUTO_PUBLISHED_WITH_FAILURES'`）
- 保留 `AI辅助`（AI_ASSISTED）、`AI出题`（AI_GENERATED）两个 badge — 这些是题目类型标签，不是状态

### 2. 删除"题目审核"菜单（[components/AdminLayout.tsx](file:///e:/桌面/oj/components/AdminLayout.tsx)）

- **移除** line 109-113 的「题目审核」菜单项
- 该菜单指向 `/admin/problems/review`，删除菜单后无入口

### 3. 删除"题目审核"页面（[app/admin/problems/review/](file:///e:/桌面/oj/app/admin/problems/review/)）

- **删除**整个目录：`app/admin/problems/review/page.tsx`
- 该页面包含 verify / reject / approve 等管理员操作

### 4. 删除后端 API 路由

- **删除** `app/api/admin/problems/review/route.ts`（获取待审核列表）
- **删除** `app/api/admin/problems/[id]/verify/route.ts`（提交标程并验证）
- **BREAKING** — 但前端已无任何调用方，安全

### 5. 清理 Prisma schema（[prisma/schema.prisma](file:///e:/桌面/oj/prisma/schema.prisma)）

`Problem` 模型移除以下字段：
```prisma
isVerified      Boolean   @default(false)   // 删除
verifiedAt      DateTime?                   // 删除
judgeStatus     String?                     // 删除
judgeMessage    String?                     // 删除
fixAttempts     Int        @default(0)      // 删除
```

`Solution` 模型移除：
```prisma
verified        Boolean   @default(false)   // 删除
verifiedAt      DateTime?                   // 删除
```

迁移策略：
- 不写 prisma migration 文件（项目使用 MongoDB，`prisma db push` 直推）
- 直接修改 `schema.prisma` 后跑 `npx prisma db push` 即可
- 老数据中 `isVerified: false` 的记录将丢失该字段（无副作用，因为前端不再读）

### 6. 清理 TypeScript 类型与后端代码

- **修改** [types/models.ts](file:///e:/桌面/oj/types/models.ts)：Problem 类型删除 `isVerified`, `verifiedAt`, `judgeStatus`, `judgeMessage`, `fixAttempts`
- **修改** [app/admin/problems/page.tsx](file:///e:/桌面/oj/app/admin/problems/page.tsx) `Problem` interface：同上
- **修改** [app/admin/problems/[id]/testcases/page.tsx](file:///e:/桌面/oj/app/admin/problems/[id]/testcases/page.tsx)：移除 `isVerified` 引用
- **修改** [app/admin/problems/source/page.tsx](file:///e:/桌面/oj/app/admin/problems/source/page.tsx)：移除 `isVerified` 引用
- **修改** [app/api/admin/problems/route.ts](file:///e:/桌面/oj/app/api/admin/problems/route.ts)：查询与响应中删除 `isVerified` 等字段
- **修改** [app/api/admin/problems/[id]/route.ts](file:///e:/桌面/oj/app/api/admin/problems/[id]/route.ts)：PUT/DELETE 中删除 `isVerified` 相关
- **修改** [app/api/admin/problems/export/route.ts](file:///e:/桌面/oj/app/api/admin/problems/export/route.ts)：导出字段删除
- **修改** [app/api/problems/[id]/route.ts](file:///e:/桌面/oj/app/api/problems/[id]/route.ts)：公开 API 响应删除
- **修改** [lib/ai/queue.ts](file:///e:/桌面/oj/lib/ai/queue.ts)：删除 `isVerified: true` 设置（line 253, 365）

### 7. 更新测试脚本

- [scripts/test-3-static-page.ts](file:///e:/桌面/oj/scripts/test-3-static-page.ts)：新增反向断言 — "需验证" / "VERIFIED" / "AUTO_PUBLISHED_WITH_FAILURES" / "题目审核" 都不应再出现

## Impact

- Affected specs: `auto-verify-and-publish-ai-problems`（未完成的同类 spec，将被本 spec 替代）
- Affected code:
  - [app/admin/problems/page.tsx](file:///e:/桌面/oj/app/admin/problems/page.tsx) (移除 badge)
  - [app/admin/problems/review/](file:///e:/桌面/oj/app/admin/problems/review/) (删除目录)
  - [app/admin/problems/[id]/testcases/page.tsx](file:///e:/桌面/oj/app/admin/problems/[id]/testcases/page.tsx) (移除 isVerified 引用)
  - [app/admin/problems/source/page.tsx](file:///e:/桌面/oj/app/admin/problems/source/page.tsx) (移除 isVerified 引用)
  - [components/AdminLayout.tsx](file:///e:/桌面/oj/components/AdminLayout.tsx) (移除菜单项)
  - [app/api/admin/problems/review/route.ts](file:///e:/桌面/oj/app/api/admin/problems/review/route.ts) (删除)
  - [app/api/admin/problems/[id]/verify/route.ts](file:///e:/桌面/oj/app/api/admin/problems/[id]/verify/route.ts) (删除)
  - [app/api/admin/problems/route.ts](file:///e:/桌面/oj/app/api/admin/problems/route.ts) (清理 isVerified)
  - [app/api/admin/problems/[id]/route.ts](file:///e:/桌面/oj/app/api/admin/problems/[id]/route.ts) (清理 isVerified)
  - [app/api/admin/problems/export/route.ts](file:///e:/桌面/oj/app/api/admin/problems/export/route.ts) (清理 isVerified)
  - [app/api/problems/[id]/route.ts](file:///e:/桌面/oj/app/api/problems/[id]/route.ts) (清理 isVerified)
  - [lib/ai/queue.ts](file:///e:/桌面/oj/lib/ai/queue.ts) (移除 isVerified: true)
  - [prisma/schema.prisma](file:///e:/桌面/oj/prisma/schema.prisma) (移除字段)
  - [types/models.ts](file:///e:/桌面/oj/types/models.ts) (移除字段)
  - [scripts/test-3-static-page.ts](file:///e:/桌面/oj/scripts/test-3-static-page.ts) (新增反向断言)

## ADDED Requirements

### Requirement: 题目列表无"需验证" badge
The system SHALL 不在 [app/admin/problems/page.tsx](file:///e:/桌面/oj/app/admin/problems/page.tsx) 题目列表展示"需验证" / "已验证" / "标程未验证" 任一状态 badge。

#### Scenario: 管理员查看题目列表
- **WHEN** 打开 [app/admin/problems](file:///e:/桌面/oj/app/admin/problems) 页面
- **THEN** 任何题目行都不显示"需验证"、"已验证"、"标程未验证"文字
- **AND** 保留"AI出题"、"AI辅助"等**类型**标签（这些不是状态徽章）

### Requirement: 无"题目审核"入口
The system SHALL 不在 [components/AdminLayout.tsx](file:///e:/桌面/oj/components/AdminLayout.tsx) admin 侧边栏展示"题目审核"菜单项。

#### Scenario: 管理员打开侧边栏
- **WHEN** 登录后进入任一 admin 页面
- **THEN** 左侧导航栏不出现"题目审核"链接

### Requirement: /admin/problems/review 路径已删除
The system SHALL 不存在 [app/admin/problems/review/](file:///e:/桌面/oj/app/admin/problems/review/) 目录。

#### Scenario: 访问 review 路径
- **WHEN** 直接访问 `/admin/problems/review`
- **THEN** Next.js 返回 404（页面已删除）

### Requirement: 后端 review/verify 路由已删除
The system SHALL 不存在 `GET/POST /api/admin/problems/review` 与 `POST /api/admin/problems/[id]/verify` 端点。

#### Scenario: API 路由探测
- **WHEN** 探测 `app/api/admin/problems/review/route.ts` 或 `app/api/admin/problems/[id]/verify/route.ts` 文件存在性
- **THEN** 文件不存在（已删除）

## MODIFIED Requirements

### Requirement: Problem 数据模型
**原行为**：`Problem` 含 `isVerified` / `verifiedAt` / `judgeStatus` / `judgeMessage` / `fixAttempts` 字段，`Solution` 含 `verified` / `verifiedAt` 字段
**改为**：以上字段从 [prisma/schema.prisma](file:///e:/桌面/oj/prisma/schema.prisma) 删除
**Migration**：`npx prisma db push` 直接同步；老数据中这些字段会消失（无业务影响）

### Requirement: 题目类型 API 响应
**原行为**：[types/models.ts](file:///e:/桌面/oj/types/models.ts) Problem 含 `isVerified: boolean` 等字段
**改为**：Problem 类型不含这些字段
**Migration**：所有 TypeScript 文件同步更新

### Requirement: AI 出题入库逻辑
**原行为**：[lib/ai/queue.ts](file:///e:/桌面/oj/lib/ai/queue.ts) 新建题目时设 `isVerified: true`
**改为**：不再设置 `isVerified`（字段已删除）
**Migration**：代码直接删除该赋值，Prisma 自动不再写入

## REMOVED Requirements

### Requirement: 人工审核 AI 题目（review 流程）
**Reason**：业务决策 2026-06 — AI 题目 100% 自动化流转，零人工介入
**Migration**：
- 删除 [app/admin/problems/review/](file:///e:/桌面/oj/app/admin/problems/review/) 整个目录
- 删除 [components/AdminLayout.tsx](file:///e:/桌面/oj/components/AdminLayout.tsx) 菜单项
- 删除 [app/api/admin/problems/review/route.ts](file:///e:/桌面/oj/app/api/admin/problems/review/route.ts)
- 删除 [app/api/admin/problems/[id]/verify/route.ts](file:///e:/桌面/oj/app/api/admin/problems/[id]/verify/route.ts)

### Requirement: "需验证" / "已验证" / "标程未验证" 状态徽章
**Reason**：无业务价值 — 题目入库即公开，无中间状态
**Migration**：删除 [app/admin/problems/page.tsx](file:///e:/桌面/oj/app/admin/problems/page.tsx) line 574-591 的 3 个 badge 条件渲染块

### Requirement: Problem 表的 isVerified / verifiedAt / judgeStatus / judgeMessage / fixAttempts 字段
**Reason**：无业务读取方
**Migration**：Prisma schema 删除 + `db push` 同步

### Requirement: Solution 表的 verified / verifiedAt 字段
**Reason**：无业务读取方
**Migration**：Prisma schema 删除 + `db push` 同步

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| 老 AI 题目在数据库中 `isVerified: false` | 字段直接删除，前端不再读，无副作用 |
| 之前 review 流程的 audit log 丢失 | 用户明确要求移除，未保留 |
| 误删生产数据 | 仅删字段定义，老记录字段值丢失但无业务读取方 |

## 验证标准

### UI 清理
- [ ] [app/admin/problems/page.tsx](file:///e:/桌面/oj/app/admin/problems/page.tsx) 全文搜"需验证" / "已验证" / "标程未验证" 0 处
- [ ] [components/AdminLayout.tsx](file:///e:/桌面/oj/components/AdminLayout.tsx) 全文搜"题目审核" 0 处
- [ ] [app/admin/problems/review/](file:///e:/桌面/oj/app/admin/problems/review/) 目录不存在

### API 清理
- [ ] [app/api/admin/problems/review/route.ts](file:///e:/桌面/oj/app/api/admin/problems/review/route.ts) 文件不存在
- [ ] [app/api/admin/problems/[id]/verify/route.ts](file:///e:/桌面/oj/app/api/admin/problems/[id]/verify/route.ts) 文件不存在

### Schema 清理
- [ ] [prisma/schema.prisma](file:///e:/桌面/oj/prisma/schema.prisma) `Problem` 模型无 `isVerified` / `verifiedAt` / `judgeStatus` / `judgeMessage` / `fixAttempts` 字段
- [ ] [prisma/schema.prisma](file:///e:/桌面/oj/prisma/schema.prisma) `Solution` 模型无 `verified` / `verifiedAt` 字段
- [ ] `npx prisma generate` 成功
- [ ] `npx prisma db push` 成功

### 代码质量
- [ ] `npx tsc --noEmit` 0 错误
- [ ] `npx tsx scripts/test-3-static-page.ts` 通过（新增反向断言）
- [ ] 端到端：触发 AI 出题 → 完成后题目在 admin/problems 列表中无"需验证" badge

## 验收清单

见 [checklist.md](file:///e:/桌面/oj/.trae/specs/remove-verification-status-and-manual-review/checklist.md)
