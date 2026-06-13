# Checklist: 重构验证与 Bug 修复

> 本清单用于系统化验证迁移后的 121 个路由是否无 bug。
> 每项检查需明确打勾；失败项需新建修复任务。

---

## A. 静态扫描 - 路由层

- [x] 路由层 0 `try { ... } catch` 业务样板（基础设施 middleware 除外）
- [x] 路由层 0 `getCurrentUser(req)` 手动调用
- [x] 路由层 0 `prisma.*` 直接调用（**62 → 0**）
- [x] 路由层 0 `console.log/info/warn`（应用 `logger.*`）
- [x] 路由层 0 `NextResponse.json` 样板（仅 health/auth 保留 cookie 场景）

## B. 静态扫描 - Service 层

- [x] `lib/**/service.ts` 0 `console.*`
- [x] `lib/**/service.ts` 0 `NextResponse.*`
- [x] 所有 `throw*` 调用在 `withApi.*` handler 内或 service 函数内
- [x] 导入路径统一从 `@/lib/api/withApi` / `@/lib/api/validation` / `@/lib/logger`

## C. 异常处理一致性

- [x] 所有 `throw400` 双参数：`(code: string, msg: string)`
- [x] 所有 `throw403/404/409/500` 单参数：`(msg: string)`
- [x] 所有 throw 出去的 `ApiError` 都被 `safeCall` 正确捕获
- [x] `readJson(req)` 在 body 缺失时 throw400
- [x] `readQuery(req)` 在解析失败时 throw400

## D. 业务回归 - 关键 10 路由 diff

- [x] `app/api/posts/[id]/route.ts` 业务逻辑对齐（view+1 由 service 处理）
- [x] `app/api/admin/users/batch-register/route.ts` 业务对齐
- [x] `app/api/admin/problems/[id]/route.ts` 业务对齐
- [x] `app/api/admin/ai/generate/route.ts` 业务对齐
- [x] `app/api/admin/problems/route.ts` 业务对齐
- [x] `app/api/contests/[id]/submissions/route.ts` 业务对齐
- [x] `app/api/users/profile/email/route.ts` 业务对齐
- [x] `app/api/admin/ai/providers/[id]/discover-models/route.ts` 业务对齐
- [x] `app/api/classes/invites/direct/[inviteId]/route.ts` 业务对齐
- [x] `app/api/classes/[id]/statistics/route.ts` 业务对齐

## E. 副作用对齐

- [x] `posts/[id]` GET 有 view 去重 +1（`incrementPostViewsDirect`）
- [x] `solutions/[id]` GET 有 view 去重 +1（`recordUniqueView` + `views: { increment: 1 }`）
- [x] 创建 / 更新 / 删除路由有正确 cache invalidation
- [x] 创建 / 加入 / 接受邀请路由发送了通知

## F. 边界场景

- [x] POST 空 body → 400 不崩溃（`readJson` 处理）
- [x] POST 无效 JSON → 400（`readJson` 处理）
- [x] 越权访问 admin 路由 → 403（`throw403`）
- [x] 访问他人私有资源 → 403/404
- [x] Token 过期 → 401（`withApi.auth`）
- [x] DB 不可用时回退到 mock / 503

## G. 验证

- [x] `npx tsc --noEmit` 0 错误
- [x] 4 个静态扫描全部 0 命中
- [x] 10 个关键路由 diff 无业务差异
- [x] 所有 throw* 参数签名正确
- [x] 路由清单：`> 200 lines: 0`, `> 150 lines: 0`

## H. 部署

- [x] 修复独立 commit（按域分批）
- [ ] `git push origin master` 成功
