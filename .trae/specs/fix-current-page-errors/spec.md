# 页面访问/权限/数据异常大规模排查与修复 Spec

## Why
用户反馈当前系统出现大量页面访问异常、权限异常、数据异常。结合近期修复历史（Next.js 16 异步 params、/api/problems 字段不一致、/notifications 400 等），还有一类问题可能未被发现：路由重命名（team→class、verification 字段等）、字段名不一致、ID 类型校验不充分。需要一次系统化的扫描 + 修复，把当前线上问题清零。

## What Changes
- [ ] 新增：用静态扫描 + 运行时错误日志 + 客户端报错日志三路并行定位剩余 bug
- [ ] 修复：所有动态路由参数 ctx.params 兼容（Next.js 16 已修，需回归确认）
- [ ] 修复：API 响应字段名与前端消费点不一致（如 `items` vs `problems`、`unreadCount` 位置、`pagination` 子对象）
- [ ] 修复：权限/角色判断使用 `user.role` 而非已删除字段（`isAdmin` vs `role`）
- [ ] 修复：ID 类型校验（ObjectId vs problemNumber vs classId）边界场景
- [ ] 修复：前端 `useEffect`/data fetching 在字段缺失时的防御性默认值
- [ ] **BREAKING**: 统一 `/api/*` 列表端响应为 `{ items, total, page, pageSize }` 或 `{ problems, pagination: {...} }`，选定其一

## Impact
- Affected specs: 上一轮 `verify-and-fix-refactor-bugs` 已完成，本轮做回归 + 新增问题修复
- Affected code:
  - `app/api/**/route.ts` (96+ 路由)
  - `app/**/page.tsx` (前端消费点)
  - `lib/api/withApi.ts` (中间件)
  - `lib/<domain>/service.ts` (业务层)
  - `lib/api/validation.ts` (校验)
  - `lib/api/base.ts` (前端 client)
  - `lib/permissions.ts` (角色判断)

## ADDED Requirements

### Requirement: 动态路由参数统一解析
The system SHALL ensure all `withApi.*` 包装的路由在 Next.js 14/15/16 三种版本下均能正确读取动态路由参数 ctx.params。

#### Scenario: 访问 /api/problems/P1025
- **WHEN** 用户访问题目详情
- **THEN** 返回 200 + 题目数据（不返回 400 或 500）

### Requirement: API 响应字段一致
The system SHALL return list 端点统一响应结构 `{ items: T[], total: number, page: number, pageSize: number, totalPages?: number }`。

#### Scenario: 任意列表 API
- **WHEN** 前端调用任意 GET 列表 API
- **THEN** 响应包含 `data.items` 数组（永不返回 undefined）

### Requirement: 权限校验统一
The system SHALL use `user.role === 'admin' || user.role === 'super_admin'` 判断管理员权限，禁止直接读取已删除/不存在的字段（如 `isAdmin`）。

#### Scenario: 普通用户访问 admin API
- **WHEN** 普通用户调用 `withApi.admin` 路由
- **THEN** 返回 403 拒绝访问

### Requirement: ID 类型校验
The system SHALL 在 ctx.params 解析时校验 ID 类型。ObjectId 用 24 位十六进制，problemNumber 用 P+数字，classId/schoolId 等同样正则校验。

#### Scenario: 错误类型 ID 访问
- **WHEN** 访问 `/api/problems/abc-invalid`
- **THEN** 返回 404 资源不存在（而非 500 Prisma 报错）

### Requirement: 前端数据缺失防御
The system SHALL 在所有 `fetch().json()` 后做 `data?.data?.items || []` 防御性默认值，缺失字段不崩溃。

#### Scenario: 响应字段缺失
- **WHEN** 服务端返回 `{ success: true, data: { } }`（items 字段缺失）
- **THEN** 页面渲染空列表而非崩溃

## MODIFIED Requirements

### Requirement: withApi 异步参数处理
**原**：Next.js 14 同步 ctx.params
**改后**：自动 await Promise 形态 ctx.params，下游路由无需修改

### Requirement: 列表响应字段命名
**原**：各端点字段不一致（items/problems/data.problems/data.data.problems）
**改后**：统一为 `data.data.items`（其他位置不在本次范围）

## REMOVED Requirements
无

---

# 阶段划分
- 阶段一：信息收集（静态扫描 + 日志 + 客户端报错）[P]
- 阶段二：分类 + 优先级排序
- 阶段三：按优先级修复
- 阶段四：回归 + 推送
