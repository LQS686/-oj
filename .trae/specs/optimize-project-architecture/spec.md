# 项目架构优化 Spec

## Why

经过 团队→班级 重构后，项目虽然功能完整，但整体架构仍存在以下结构性瓶颈，限制可维护性、可扩展性和运行效率：

- 业务层抽离不彻底：仅 `lib/class/` 完整抽离，`contest` / `problem` / `user` / `notification` 等模块的 API 路由仍直接调用 Prisma，逻辑散布
- 调用重复严重：组件、路由、hooks 各自维护获取用户、班级等数据的方法，未集中缓存
- 命名/规范不统一：路由、组件、变量的命名风格混用，缺少 lint 规则强制
- 工具/组件冗余：`MarkdownEditor` / `MarkdownRenderer` 散落在 `components/` 根目录和子目录，`validateObjectId` 等工具多处复制
- 缺少稳定的中间件体系：认证、ID 校验、限流、错误处理、权限检查未形成可复用层
- 缺少请求级缓存：相同数据被反复查询数据库

## What Changes

### 1. 业务层抽离 (核心)

将散落在 API 路由中的 Prisma 调用按业务领域抽离到 `lib/<domain>/`，与 `lib/class/` 保持一致风格：

- `lib/auth/` —— 登录、注册、token、当前用户上下文
- `lib/user/` —— 用户资料、偏好、头像、统计
- `lib/contest/` —— 竞赛 CRUD、报名、榜单
- `lib/problem/` —— 题目 CRUD、标签、提交
- `lib/submission/` —— 提交 CRUD、判题结果查询
- `lib/notification/` —— 通知 CRUD、已读标记
- `lib/post/` —— 帖子 / 评论
- `lib/ranking/` —— 排行榜
- `lib/solution/` —— 题解
- `lib/training/` —— 训练计划

每个 lib/<domain>/ 至少包含 `index.ts`（公共 re-export）+ `service.ts`（CRUD）+ `validation.ts`（参数校验）三类文件。

### 2. 路由中间件化

新建 `lib/api/handler.ts` 提供 `withAuth(handler)`、`withClassRole(handler, allowedRoles)`、`withRateLimit(limiter)` 等高阶函数包装 API 路由，消除重复样板代码。

### 3. 请求级缓存

- 服务端：使用 `lib/cache.ts`（已存在）封装常见查询（当前用户、班级成员、题目信息等），TTL 60s
- 客户端：引入 SWR（轻量）作为前端请求缓存层，消除组件内重复 `useEffect + fetch`

### 4. 命名规范统一

- 文件命名：组件 PascalCase，工具/hook camelCase，目录 kebab-case
- 局部变量：避免保留字 `class` 等，明确禁止 ESLint 警告
- Prisma 模型：PascalCase（已统一）
- 统一导入路径别名：`@/lib`、`@/components`、`@/types`、`@/hooks`

### 5. 冗余清理

- 删除 `replace_console.cjs`（一次性脚本已用完）
- 删除根目录的 `components/MarkdownEditor.tsx` / `MarkdownRenderer.tsx`，统一使用 `components/solution/` 子目录版本
- 删除空的 `services/authService.ts`，迁入 `lib/auth/`
- 删除/合并 `lib/mongodb.ts` + `lib/mongodb-direct.ts`（功能重叠）
- 合并 `lib/test-case-score.ts` + `lib/testcase-score.ts` + `lib/testcase-upload.ts` 到 `lib/problem/testcase.ts`

### 6. 稳定性增强

- 在 `app/(main)/layout.tsx` 等关键布局添加 `error.tsx` / `loading.tsx`（已部分存在，统一规范）
- 在 `lib/api/handler.ts` 集中异常捕获，返回统一格式 `{ ok, data, error, code }`
- 引入 `zod` 做运行时参数校验，路由 handler 第一步即校验

### 7. 目录结构

最终目标结构（增量）：

```
lib/
  api/                 # 通用：handler / base / 各域客户端
  auth/                # 认证
  user/                # 用户
  class/               # 班级（已有）
  contest/             # 竞赛
  problem/             # 题目
  submission/          # 提交
  notification/        # 通知
  post/                # 帖子
  ranking/             # 排行榜
  solution/            # 题解
  training/            # 训练
  points/              # 积分（保留并完善）
  ai/                  # AI（保留）
  judge/               # 评测（保留）
  ...
```

## Impact

- Affected specs: 所有功能模块、API 路由、前端数据获取
- Affected code:
  - `app/api/**/*.ts`（约 100 个路由 handler）
  - `app/**/page.tsx`（约 40 个页面，简化数据获取）
  - `lib/`（新建 ~10 个业务模块目录，合并冗余）
  - `components/`（清理根目录散落组件）

**BREAKING**：
- 导入路径变更：业务模块从 `import { xxx } from '@/lib/...'` 改为通过业务层 re-export
- API 响应格式统一：所有 API 返回 `{ ok, data, error, code }` 顶层结构

## ADDED Requirements

### Requirement: 业务层模块化
所有 API 路由应通过 `lib/<domain>/service.ts` 间接操作数据库，禁止在路由中直接调用 prisma 客户端。

#### Scenario: 业务调用链清晰
- **WHEN** 路由需要查询用户信息
- **THEN** 调用 `userService.findById(id)` 而非 `prisma.user.findUnique(...)`
- **Verification**: `grep -r "prisma\." app/api/` 仅出现在调用 `service.ts` 的位置

### Requirement: 请求级缓存
高频公共查询（当前用户、班级成员、题目详情）应使用服务端缓存，TTL ≤ 60s。

#### Scenario: 相同数据重复查询
- **WHEN** 60s 内多次请求当前用户
- **THEN** 第二次及以后命中缓存，不再查询数据库

### Requirement: 路由中间件化
所有 API handler 应使用 `withAuth` / `withClassRole` / `withRateLimit` 等中间件，避免在每个 handler 重复样板代码。

#### Scenario: 鉴权样板消除
- **WHEN** 路由需要登录态 + 班级成员角色校验
- **THEN** 通过 `withAuth(withClassRole(handler, ['teacher', 'assistant']))` 组合
- **Verification**: 路由 handler 中 `getCurrentUser` + `getClassMembership` 重复代码 ≤ 1 处

### Requirement: 前端 SWR 集成
客户端数据获取应使用 SWR 替代手写 `useEffect + fetch + setState`。

#### Scenario: 重复渲染不重复请求
- **WHEN** 同一页面 2 个组件同时显示当前用户
- **THEN** 仅 1 次网络请求，结果共享

### Requirement: 命名规范统一
ESLint 规则 + 命名风格指南文档化。

#### Scenario: 新增文件检查
- **WHEN** 新增 React 组件
- **THEN** 文件名 PascalCase 且 `react/jsx-pascal-case` 规则通过
- **WHEN** 新增 hook
- **THEN** 文件名以 `use` 开头

### Requirement: 统一响应格式
所有 API 返回 `{ ok: boolean, data?, error?, code? }` 结构。

#### Scenario: 客户端错误处理简化
- **WHEN** 客户端收到 4xx/5xx 响应
- **THEN** 通过 `error.code` 统一判断，不需区分多种响应结构

## MODIFIED Requirements

### Requirement: 业务模块命名一致
`lib/` 下每个业务模块目录结构应统一为 `service.ts` / `validation.ts` / `index.ts` / `types.ts`。

#### Scenario: 新增业务模块
- **WHEN** 新建一个 `lib/<domain>/` 目录
- **THEN** 必须包含上述 4 类文件（`index.ts` 公共 re-export，其他按需）

### Requirement: 路由异常处理
路由 handler 内部不再 `try/catch`，由 `withAuth` 统一处理。

#### Scenario: 错误冒泡
- **WHEN** 业务方法抛出异常
- **THEN** `withAuth` 统一捕获并返回 500 + 错误日志

## REMOVED Requirements

### Requirement: 散落的 console.log
**Reason**: 已通过 `comprehensive-check-and-optimization` 替换为 logger
**Migration**: 无（已统一）

### Requirement: 直接 prisma 调用的 API 路由
**Reason**: 业务逻辑未分层，重复代码多
**Migration**: 全部通过 `lib/<domain>/service.ts` 间接调用

## 技术实施原则

- **不破坏外部契约**：API 的 URL、方法、响应字段（`data` 内部结构）保持兼容
- **渐进式迁移**：先新建 `lib/<domain>/service.ts` 并暴露相同 API，路由先调用 service；功能稳定后再删除原内联代码
- **可回退**：每个 lib 模块先独立提交，便于回滚
