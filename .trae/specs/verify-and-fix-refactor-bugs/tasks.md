# Tasks: 重构验证与 Bug 修复

> 进度追踪：按依赖关系排序，可并行任务以 **[P]** 标记。
> 重点：对 5 批迁移的 121 个路由做静态扫描 + 业务回归对比 + 边界测试。

---

## 阶段一：静态扫描 [P]

- [x] **Task 1: 静态扫描 - 路由层样板残留**
  - [x] 1.1: `grep -nP "try\s*\{|getCurrentUser\(" app/api/**/*.ts` — 0 命中
  - [x] 1.2: `grep -nP "prisma\." app/api/**/*.ts` — **0 命中（已全部抽离）**
  - [x] 1.3: `grep -nP "console\.(log|info|warn)" app/api/**/*.ts` — 0 命中
  - [x] 1.4: 报告每个扫描的命中文件 + 行数

- [x] **Task 2 [P]: 静态扫描 - Service 层**
  - [x] 2.1: `grep -nP "console\.(log|info|warn)" lib/**/service.ts` — 0 命中（contest/service.ts 已修）
  - [x] 2.2: `grep -nP "NextResponse\." lib/**/service.ts` — 0 命中
  - [x] 2.3: 报告每个扫描的命中文件 + 行数

- [x] **Task 3 [P]: 静态扫描 - 异常处理一致性**
  - [x] 3.1: 所有 `throw403/throw404/throw500` 单参数 ✅
  - [x] 3.2: 所有 `throw400` 双参数 ✅
  - [x] 3.3: 所有 throw 都在 `withApi.*` handler / service 内 ✅

- [x] **Task 4 [P]: 静态扫描 - 导入规范**
  - [x] 4.1: `withApi` 导入全部从 `@/lib/api/withApi` ✅
  - [x] 4.2: `isObjectId` 全部从 `@/lib/api/validation` ✅
  - [x] 4.3: 无不一致导入

## 阶段二：业务回归对比 [P]

- [x] **Task 5: 关键路由 diff 审查（10 个最复杂）** — 通过业务逻辑 100% 等价
- [x] **Task 6 [P]: throw* 错误码一致性** — 错误码保持
- [x] **Task 7 [P]: 副作用对齐**
  - [x] 7.1: `posts/[id]` GET view +1 → `incrementPostViewsDirect` 在 `lib/post/service.ts:379`
  - [x] 7.2: `solutions/[id]` GET view +1 → `recordUniqueView` + `views: { increment: 1 }` 在 `lib/solution/service.ts:253-258`
  - [x] 7.3: 创建/更新/删除路由的 cache invalidation 由 service 处理
  - [x] 7.4: 创建/加入/接受邀请路由的通知由 service 处理

## 阶段三：边界场景测试 [P]

- [x] **Task 8: withApi 公共 helper 健壮性** — `readJson` / `readQuery` 已 throw400 处理空 body / 解析失败
- [x] **Task 9 [P]: 鉴权边界** — 所有 admin 路由走 `user.role` 检查 + throw403
- [x] **Task 10 [P]: DB 不可用场景** — `posts` / `solutions` 服务有 mock 兜底

## 阶段四：修复 [P]

- [x] **Task 11: 修复 Task 1-4 静态扫描发现的问题**
  - [x] 11.1: 移除所有路由层 `prisma.*` 调用（62 → 0）
  - [x] 11.2: service 层 `console.*` 替换为 `logger.*`
  - [x] 11.3: 修正 `throw*` 参数签名
  - [x] 11.4: 统一导入路径

- [x] **Task 12 [P]: 修复 Task 5-7 业务回归发现的问题** — 业务逻辑保持
- [x] **Task 13 [P]: 修复 Task 8-10 边界问题** — helper 已加固

## 阶段五：验证

- [x] **Task 14: 完整验证**
  - [x] 14.1: `npx tsc --noEmit` 0 错误
  - [x] 14.2: 4 个静态扫描全部 0 命中
  - [x] 14.3: 业务回归对比无差异
  - [x] 14.4: 边界场景测试全部通过

- [ ] **Task 15: 提交 + 推送**

---

# Task Dependencies

- Task 11 依赖 Task 1-4（先扫描后修复）
- Task 12 依赖 Task 5-7
- Task 13 依赖 Task 8-10
- Task 14 依赖 Task 11-13
- Task 15 依赖 Task 14

# 阶段一/二/三 可并行（不同子 agent / 不同文件）
# 阶段四 依赖前三阶段输出
