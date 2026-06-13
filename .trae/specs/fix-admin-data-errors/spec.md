# 管理后台数据异常系统性修复 Spec

## Why
用户在 `/spec` 反馈"管理后台相关页面大量数据异常"。结合最近两次连续 TypeError（`providers.map is not a function`、`data.data.filter is not a function`）和静态扫描，发现 9 个 admin API 端点仍存在 `ok({ data })` 双层包装（HTTP body 嵌套结构 `{ success, data: { data: X } }`），客户端 `setXxx(data.data)` 拿到的是 `{ data: X }` 对象而非数组，渲染时崩溃。

需要统一修复：服务端解开双层包装、客户端补 `Array.isArray` 防御 + 字段读取规范。

## What Changes
- 服务端：9 个 admin GET 端点的 `ok({ data })` 双层包装解开为 `ok(X)`（或更明确字段名）
- 客户端：所有 `setXxx(data.data)` / `data.data.map|filter` 模式改为三级回退 `data.data?.xxx || data.data || []` + `Array.isArray` 防御
- 新增工具函数 `pickList<T>(data, key)` 统一抽取（可选）
- 已知 TypeError（已完成）：
  - `app/admin/ai-models/page.tsx:136` providers/models - 101daeb
  - `app/admin/ai-generation/page.tsx:206` models - 2c75317

## Impact
- Affected specs: `fix-current-page-errors`（已完成），本 spec 聚焦 admin 子集
- Affected code:
  - 服务端 9 个端点：
    - `app/api/admin/contests/route.ts:18`
    - `app/api/admin/problems/[id]/verification-logs/route.ts:16`
    - `app/api/admin/users/route.ts:12`
    - `app/api/admin/problems/review/route.ts:12`
    - `app/api/admin/posts/route.ts:12`
    - `app/api/admin/logs/source-changes/route.ts:12`
    - `app/api/admin/dashboard/route.ts:15`
    - `app/api/admin/classes/route.ts:15`
    - `app/api/admin/ai/config/route.ts:36`
  - 客户端 11 个文件 + 17 个管理后台页面
  - 1 个工具函数文件 `lib/api/base.ts`（如新增 pickList）

## ADDED Requirements

### Requirement: Admin 列表端点统一响应结构
The system SHALL return admin list 端点统一为 `ok(X)`，X 本身即列表数组（不嵌套 `data` 字段）。dashboard 等非列表端点保留 `ok({ ...stats })` 形态。

#### Scenario: GET /api/admin/contests
- **WHEN** 管理员访问竞赛管理页
- **THEN** 响应为 `{ success: true, data: [...contests] }`，客户端 `setContests(data.data)` 拿到数组

#### Scenario: GET /api/admin/users
- **WHEN** 管理员访问用户管理页
- **THEN** 响应为 `{ success: true, data: [...users] }`，客户端 `setUsers(data.data)` 拿到数组

### Requirement: 客户端字段读取防御
The system SHALL 在所有 `setXxx(data.data)` 处加 `Array.isArray` + 三级回退：`data.data?.items || data.data || []`。

#### Scenario: 字段形态不统一
- **WHEN** 服务端返回 `{ data: { items: [...] } }` 或 `{ data: [...] }` 或 `{ data: {} }`
- **THEN** 客户端 `setXxx` 总是拿到数组（永不 undefined/object）

### Requirement: 数组方法调用前必检
The system SHALL 任何 `.map|filter|forEach|some|every` 调用前必须有 `Array.isArray(x) && x.length > 0` 守卫。

#### Scenario: 数据为空
- **WHEN** 服务端返回 `{ data: [] }`
- **THEN** `.filter` / `.map` 不抛 TypeError

## MODIFIED Requirements
无（这是新聚焦 spec，继承自 `fix-current-page-errors` 的统一规范）

## REMOVED Requirements
无

---

# 阶段划分
- 阶段一：服务端解开 9 个 `ok({ data })` 双层包装
- 阶段二：客户端补 `Array.isArray` 防御（17 个 admin 页面 + 已知 2 个 bug 已修）
- 阶段三：验证 + 推送
