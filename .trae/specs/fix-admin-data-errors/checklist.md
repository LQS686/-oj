# Checklist - 管理后台数据异常系统性修复

## A. 服务端双层包装解开（10 个端点）

- [x] A1: `app/api/admin/contests/route.ts:18` `ok({ data })` → `ok(data)`
- [x] A2: `app/api/admin/problems/[id]/verification-logs/route.ts:16` → `ok(data)`
- [x] A3: `app/api/admin/users/route.ts:12` → `ok(data)`
- [x] A4: `app/api/admin/problems/review/route.ts:12` → `ok(data)`
- [x] A5: `app/api/admin/posts/route.ts:12` → `ok(data)`
- [x] A6: `app/api/admin/logs/source-changes/route.ts:12` → `ok(data)`
- [x] A7: `app/api/admin/classes/route.ts:15` → `ok(data)`
- [x] A8: `app/api/admin/ai/config/route.ts:36` GET 分支 → `ok(data)`
- [x] A9: `app/api/admin/dashboard/route.ts:15` → `ok(data)`
- [x] A10: `app/api/admin/testcases/upload/route.ts:59` 解开双层包装

## B. 客户端列表读取点防御

- [x] B1: `app/admin/users/page.tsx:92` setUsers 加 Array.isArray 防御
- [x] B2: `app/admin/contests/page.tsx:46` setContests 加防御
- [x] B3: `app/admin/problems/source/page.tsx:48` setLogs 加防御
- [x] B4: `app/admin/problems/review/page.tsx:97` setProblems 加防御
- [x] B5: `app/admin/problems/[id]/testcases/page.tsx:66` setLogs 加防御
- [x] B6: `app/admin/contests/[id]/edit/page.tsx:79` data.data 加防御
- [x] B7: 已修确认 - `app/admin/contests/create/page.tsx`、`app/admin/problems/page.tsx`、`app/admin/posts/page.tsx`、`app/admin/classes/page.tsx`（5351638）

## C. 客户端数组方法调用守卫

- [x] C1: `app/admin/problems/[id]/testcases/page.tsx:198` data.data.testCases.map 加守卫
- [x] C2: `app/admin/contests/[id]/edit/page.tsx:79` data.data.filter 加守卫
- [x] C3: `app/admin/page.tsx:43` dashboard 字段读取 - 服务端已修

## D. 仪表盘 / 设置 / AI 配置特殊端点

- [x] D1: `/api/admin/dashboard` 响应字段明确
- [x] D2: `/api/admin/settings` 客户端 `app/admin/settings/page.tsx` 字段读取
- [x] D3: `/api/admin/ai/config` 客户端使用点审查

## E. 验证

- [x] E1: `npx tsc --noEmit` 0 错误
- [x] E2: 17 个 admin 页面手动抽样由用户执行
- [x] E3: 客户端 console.error 拦截无新增 TypeError

## F. 部署

- [x] F1: 修复按域分批 commit
- [x] F2: `git push origin master` 成功

## G. 已知修复确认（前置 commit）

- [x] G1: `101daeb` fix(ai-models): providers/models 字段读取
- [x] G2: `2c75317` fix(ai-generation): fetchModels + layout scroll-behavior
