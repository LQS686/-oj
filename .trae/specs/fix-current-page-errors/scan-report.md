# 静态扫描报告

## A. 路由层样板残留

### A1. `prisma.*` 直接调用 in `app/api/**/route.ts`
✅ **0 命中**（之前已通过 withApi 模式抽离）

### A2. `console.*` in `app/api/**/route.ts`
❌ **20 命中**，需要修复：

| 文件:行 | 用途 |
|---|---|
| `app/api/problems/route.ts:118` | 错误兜底日志 |
| `app/api/classes/[id]/notes/[noteId]/read/route.ts:32` | 错误兜底日志 |
| `app/api/users/avatar/upload/complete/route.ts:48` | 错误兜底日志 |
| `app/api/users/avatar/upload/init/route.ts:11` | 异步清理失败 |
| `app/api/admin/testcases/upload/route.ts:19-59` | 大量 emoji 调试日志（11 处） |
| `app/api/health/db/route.ts:63` | 健康检查错误 |
| `app/api/classes/[id]/points/stats/route.ts:37` | 错误日志 |
| `app/api/classes/[id]/points/shop/exchanges/route.ts:48` | 错误日志 |
| `app/api/classes/[id]/points/ranking/route.ts:41` | 错误日志 |
| `app/api/classes/[id]/points/shop/exchange/route.ts:55` | 错误日志 |

### A3. `ctx.params.*` 直接访问 (无 `(ctx as any)`)
📋 **2 命中**（仅 `notifications/[id]/route.ts`）：
- L11, L18 — `validateObjectId(ctx.params.id, ...)` — 已被 withApi 解析，无需修改

### A4. `(ctx as any).params` 使用点
📋 **94 命中**（已通过 withApi.resolveCtxParams 统一 await 兼容，零修改下游）

## B. 响应字段不一致

### 服务端实际返回 vs 前端消费

| 端点 | 服务端返回 | 前端读取 | 状态 |
|---|---|---|---|
| `/api/problems` (list) | `{ problems, pagination: {...} }` | `data.data.problems` | ✅ 已修 |
| `/api/notifications` | `{ items, total, unreadCount, page, pageSize }` | `data.data.notifications` | ❌ **错位** |
| `/api/classes` | (待查) | `data.data.classes` | 待查 |
| `/api/contests` | (待查) | `data.data.contests` | 待查 |
| `/api/posts` | (待查) | `data.data.posts` | 待查 |
| `/api/solutions` (list) | (待查) | `data.data.items` / `data.data.solutions` | 待查 |
| `/api/submissions` (list) | (待查) | `data.data.submissions` | 待查 |

## C. 权限校验

📋 **lib/permissions.ts:10-12**:
```ts
export function isAdmin(user: User | null): boolean {
  if (!user) return false
  return user.role === 'ADMIN' || user.isAdmin === true
}
```

⚠️ `user.role === 'ADMIN'`（大写）但 `withApi.admin` 用 `user.role === 'admin'`（小写）→ **大小写不一致**！

需要统一为小写（与 Prisma schema 一致）。

## D. ID 校验
- ObjectId: `/^[0-9a-fA-F]{24}$/` ✓
- problemNumber: `P\d+` ✓ (通过 `isObjectIdLike` 分流)
- 错误 ID 应返回 400/404 — 当前问题为 P2023 Prisma 报错 → 500

## E. 前端防御

未防御的 12 处（待 Task 8 修复）：
- `app/classes/page.tsx:64` — setClasses(data.data.classes)
- `app/notifications/page.tsx:54` — setNotifications(data.data.notifications)
- `app/submissions/page.tsx:91` — setSubmissions(data.data.submissions)
- `app/problem/[id]/page.tsx:151,162` — setSubmissions(data.data.submissions)
- `app/contests/[id]/problems/[problemId]/page.tsx:129`
- `app/contests/[id]/submissions/page.tsx:48`
- `app/contests/[id]/rank/page.tsx:55`
- `app/contests/page.tsx:151`
- `app/discuss/page.tsx:86,116`
- `app/submission/[id]/page.tsx:106`

## F. 客户端 console.error 拦截日志
需要在实现阶段要求用户提供最近 1h 客户端日志；或抽样检查 intercept-console-error.ts 实现后做静态推断。
