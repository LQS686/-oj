# 重构验证与 Bug 修复 Spec

## Why

经过 5 批 121 个 API 路由迁移到 withApi 中间件后，业务逻辑被抽离到 `lib/<domain>/service.ts`。但：
- 抽离过程中可能引入**业务逻辑偏差**（权限校验、错误码、字段映射）
- TS 严格模式下的 `!` 非空断言可能掩盖了真实边界
- 边界场景（DB 不可用、参数缺失、并发、缓存命中）未做端到端验证
- 公共 helper（如 `safeCall` / `readJson` / `readQuery`）的健壮性需要压力测试

需要做一次系统化的**验证 + Bug 扫描 + 修复**。

## What Changes

### 1. 静态扫描
- 检查所有 `app/api/**/route.ts` 中是否仍残留手写 `try/catch` + `NextResponse.json` 样板
- 检查 `lib/<domain>/service.ts` 中是否有 `console.*`（应统一走 logger）
- 检查 `app/api/**/route.ts` 中是否有直接 `prisma.*` 调用（应收敛在 service）
- 检查 `throw4xx` / `throw5xx` 调用的参数签名是否正确

### 2. 业务回归对比
对每个迁移过的路由，**对比 git HEAD~N 与 HEAD** 的关键差异：
- 鉴权条件（role 检查、ownership 检查）
- 错误码 / HTTP 状态码
- 返回字段 / 数据结构
- 中间件副作用（缓存写入、通知发送）

### 3. 边界场景测试
- DB 连接失败：是否回退到 mock / 503？
- 缺失参数：是 `throw400` 而非崩溃？
- 越权访问：普通用户访问 admin 路由是否 403？
- 缓存键冲突：不同用户是否隔离？
- 并发：同一提交被评测队列处理两次？

### 4. 修复并验证
对扫描发现的所有 bug，新建 tasks 并委托子 agent 修复。

## Impact

- Affected specs: `optimize-project-architecture`（其迁移部分现在需要验证）
- Affected code:
  - `app/api/**/route.ts`（121 个）
  - `lib/<domain>/service.ts`（12 个）
  - `lib/api/withApi.ts`（基础设施）
  - `lib/cache.ts`（缓存层）

## ADDED Requirements

### Requirement: 路由层零手写样板
所有 `app/api/**/route.ts` 中**不**应出现：
- 手动 `try { ... } catch { NextResponse.json(...) }`（业务 handler 内）
- 手动 `getCurrentUser(req)` + 401 检查（应用 `withApi.auth`）
- 手动 `isObjectId()` + 404 检查（应用 `withApi.public` 或 service 内部）

#### Scenario: 扫描通过
- **WHEN** 跑 `grep -nP "try\s*\{|getCurrentUser\(" app/api/**/*.ts`
- **THEN** 0 命中（基础设施 + middleware 排除）

### Requirement: Service 层 0 console
所有 `lib/<domain>/service.ts` 中**不**应出现 `console.log/info/warn`。
应使用 `logger.info/error/warn` from `@/lib/logger`。

#### Scenario: 扫描通过
- **WHEN** 跑 `grep -nP "console\.(log|info|warn)" lib/**/service.ts`
- **THEN** 0 命中

### Requirement: 路由层 0 直接 prisma
所有 `app/api/**/route.ts` 中**不**应出现 `prisma.*` 调用。
#### Scenario: 扫描通过
- **WHEN** 跑 `grep -nP "prisma\." app/api/**/*.ts`
- **THEN** 0 命中

### Requirement: 业务逻辑 100% 等价
迁移前后，**每个路由**的以下属性保持一致：
- URL 路径 + HTTP 方法
- 请求体 / 查询参数 schema
- 响应数据结构（含字段名、null vs undefined）
- 错误码 + HTTP 状态码
- 鉴权条件
- 副作用（缓存、通知、文件、日志）

#### Scenario: 路由 diff 验证
- **WHEN** 抽取 `git diff HEAD~5 HEAD -- app/api/<route>/route.ts`
- **THEN** 关键业务代码段（如权限校验、字段映射）应保持等价

### Requirement: 公共 helper 健壮
- `readJson(req)`：body 缺失时返回 400 而非崩溃
- `readQuery(req)`：URLSearchParams 解析失败时返回 400
- `safeCall(handler)`：未知错误时返回 500 + 记录日志
- `withApi.public/auth/admin`：ctx 缺失 params 时不崩溃

#### Scenario: 边界场景不崩溃
- **WHEN** 客户端 POST 空 body
- **THEN** 路由返回 400 `{ code: 'EMPTY_BODY' }` 而非 500

## MODIFIED Requirements

### Requirement: 重构完成度
`optimize-project-architecture` spec 的**阶段六（验证）**现在应全部通过：
- `app/api/**/*.ts` 单文件不超过 200 行（121 个路由全部满足）
- 全量路由迁移到 withApi 中间件（已迁移 121/121）

#### Scenario: 路由清单
- **WHEN** 跑 `node scripts/audit-routes.mjs`
- **THEN** 输出 `> 200 lines: 0`, `> 150 lines: 0`

## REMOVED Requirements

（无）

## 技术实施原则

- **零假设**：每个 bug 需有具体复现步骤 + 证据（git diff / grep / tsc 报错）
- **不引入新功能**：仅修复发现的问题，不顺手重构
- **每个修复独立 commit**：便于回滚
- **保持 service 层 0 console**：用 logger
