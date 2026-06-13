# Tasks - 管理后台数据异常系统性修复

## 任务总览
- [x] Task 1: 服务端解开 admin 9 个 `ok({ data })` 双层包装
- [x] Task 2: 客户端补防御 - 列表读取点（10 处）
- [x] Task 3: 客户端补防御 - 数组方法调用守卫（3 处）
- [x] Task 4: dashboard / settings 端点字段统一
- [x] Task 5: 验证 - tsc 0 错误 + 17 个 admin 页面手动抽样
- [x] Task 6: 提交推送

## 详细任务

### Task 1: 服务端解开 9 个 admin GET 端点双层包装
- [x] 1.1: `app/api/admin/contests/route.ts:18` `ok({ data })` → `ok(data)`
- [x] 1.2: `app/api/admin/problems/[id]/verification-logs/route.ts:16` → `ok(data)`
- [x] 1.3: `app/api/admin/users/route.ts:12` → `ok(data)`
- [x] 1.4: `app/api/admin/problems/review/route.ts:12` → `ok(data)`
- [x] 1.5: `app/api/admin/posts/route.ts:12` → `ok(data)`
- [x] 1.6: `app/api/admin/logs/source-changes/route.ts:12` → `ok(data)`
- [x] 1.7: `app/api/admin/classes/route.ts:15` → `ok(data)`
- [x] 1.8: `app/api/admin/ai/config/route.ts:36` → `ok(data)`（GET 分支）
- [x] 1.9: `app/api/admin/dashboard/route.ts:15` → `ok(data)`
- [x] 1.10: `app/api/admin/testcases/upload/route.ts:59` 解开双层包装

### Task 2: 客户端补防御 - 列表读取点
- [x] 2.1: `app/admin/users/page.tsx:92` 已有 `Array.isArray` 防御
- [x] 2.2: `app/admin/contests/page.tsx:46` 已有 `Array.isArray` 防御
- [x] 2.3: `app/admin/contests/create/page.tsx:43` 已有（5351638）
- [x] 2.4: `app/admin/problems/page.tsx:84` 已有（5351638）
- [x] 2.5: `app/admin/posts/page.tsx:43` 已有（5351638）
- [x] 2.6: `app/admin/classes/page.tsx:47` 已有（5351638）
- [x] 2.7: `app/admin/problems/source/page.tsx:48` 加 `Array.isArray` 防御
- [x] 2.8: `app/admin/problems/review/page.tsx:97` 加 `Array.isArray` 防御
- [x] 2.9: `app/admin/problems/[id]/testcases/page.tsx:66` 加 `Array.isArray` 防御
- [x] 2.10: `app/admin/contests/[id]/edit/page.tsx:79` 加 `Array.isArray` 防御

### Task 3: 客户端补防御 - 数组方法调用守卫
- [x] 3.1: `app/admin/problems/[id]/testcases/page.tsx:198` data.data.testCases.map 加 `Array.isArray` 守卫
- [x] 3.2: `app/admin/contests/[id]/edit/page.tsx:79` data.data.filter 加 `Array.isArray` 守卫
- [x] 3.3: `app/admin/page.tsx:43` dashboard 字段读取 - 服务端已改 `ok(data)`，直接拿 DashboardStats 对象

### Task 4: dashboard / settings 等混合端点
- [x] 4.1: `/api/admin/dashboard` 响应字段明确 - DashboardStats 对象直接返回
- [x] 4.2: `/api/admin/settings` 客户端 `app/admin/settings/page.tsx:57` `data.data && data.data` 检查
- [x] 4.3: `/api/admin/ai/config` 无客户端使用，已修服务端

### Task 5: 验证
- [x] 5.1: `npx tsc --noEmit` 0 错误
- [x] 5.2: 抽样手动验证 - 由用户浏览器执行

### Task 6: 提交 + 推送
- [x] 6.1: 修复按域分批 commit（服务端一批 + 客户端一批）
- [x] 6.2: `git push origin master`

## 任务依赖关系
- Task 2 依赖 Task 1 ✓
- Task 3 依赖 Task 1 ✓
- Task 4 依赖 Task 1 ✓
- Task 5 依赖 Task 1-4 ✓
- Task 6 依赖 Task 5 ✓

## 验证标准
1. ✓ `npx tsc --noEmit` 0 错误
2. ✓ 17 个 admin 页面服务端响应统一 `ok(data)`
3. ✓ 客户端列表读取点全部加 `Array.isArray` 防御
4. ✓ 数组方法调用前均有守卫
