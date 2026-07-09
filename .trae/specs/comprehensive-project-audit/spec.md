# 全面审查整个项目 Spec

## Why

项目经过多轮迭代（评测机优化、提交结果弹窗、AI 生成、权限统一、班级/竞赛/题单模块等）后，代码量已显著增长（约 100 个 API 路由、自定义评测机、AI 生成管线、WebSocket 实时推送）。各模块经过不同时期、不同规范的修改，存在以下系统性风险需要一次端到端的全面审查来暴露和收敛：

1. **类型安全退化**：全项目 196 处 `any` 使用，集中在 AI 模块（generator.ts 26 处、queue.ts 22 处、service.ts 19 处）和 contest/service.ts（20 处），削弱了 TS 严格模式的价值。
2. **日志与调试残留**：293 处 `console.*` 调用散落 47 个文件，ESLint 仅放行 warn/error/info，`console.log`/`debug` 仍可能泄露运行时细节。
3. **轮询与实时推送**：21 个文件使用 `setInterval`，虽有近期 visibility-awareness 修复，但需统一核查是否存在后台轮询泄漏、重复订阅、WS 与轮询叠加。
4. **跨模块回归风险**：评测机、AI 生成、提交弹窗近期改动较大，需验证未引入跨层影响（如类型契约、前端轮询、Docker 兼容）。
5. **安全与权限一致性**：权限系统已统一到 `lib/permissions.ts`，但需核查所有 API 路由是否真正经由 `withApi` 鉴权、是否存在绕过中间件的路径、输入校验是否完整。
6. **测试覆盖不足**：仅 `tests/api.test.ts` 一个测试文件，核心业务（评测、AI 生成、权限、竞赛排名）缺乏回归保障。

## What Changes

本次为「审查 + 修复」型规范，按优先级分阶段执行。审查阶段产出问题清单，修复阶段逐项收敛。

### 1. 安全审查与加固（优先级：P0 最高）
- 核查所有 API 路由鉴权：是否经由 `withApi` / `withApi.admin`，是否存在未鉴权路径
- 核查权限校验一致性：角色判定是否统一走 `lib/permissions.ts`，是否存在硬编码 `role === 'xxx'`
- 核查输入校验：所有写入接口是否有 Zod / 手写校验，是否存在未校验的 body/query/param
- 核查敏感信息泄露：JWT payload 是否最小化、错误响应是否暴露堆栈/内部信息、`console.log` 是否打印敏感数据
- 核查限流覆盖：`middleware.ts` 限流是否覆盖关键接口、是否存在可被滥用的写接口未限流
- 核查文件上传与执行：评测机沙箱、testcase 上传、头像上传路径是否安全

### 2. 评测机正确性与稳定性审查（优先级：P0）
- 核查 `lib/judge/*`（executor/compiler/judger/queue/worker/comparator/runner.sh）近期改动的正确性
- 核查资源统计（CPU 时间 / VmHWM 内存）的准确性、跨平台兼容（Docker /usr/bin/time、/proc 读取）
- 核查超时窗口、rejudge 逻辑、并发控制、任务超时与失败回收
- 核查临时文件清理、编译产物泄漏、子进程僵尸回收

### 3. AI 生成模块审查（优先级：P1）
- 核查 `lib/ai/*` 类型安全：收敛 `any` 使用，补全 OpenAI 响应类型
- 核查队列（queue.ts / solution-queue.ts）任务幂等性、失败重试、超时回收
- 核查 provider/model 一致性、配置校验、密钥管理
- 核查质量门禁（quality-check.ts）与响应解析（response-parser.ts）的健壮性
- 核查 AI 任务与评测机、前端的时序契约

### 4. 后端 API 与数据层审查（优先级：P1）
- 核查 N+1 查询、缺索引查询、未分页的列表接口
- 核查事务使用（涉及多表写入的操作是否原子）
- 核查错误处理：是否统一经 `lib/api/handler.ts`，是否存在吞异常的空 catch
- 核查 `stats` 字段契约（assignmentCount/problemCount/noteCount）一致性
- 核查 MongoDB/Prisma schema 索引完整性

### 5. 前端与 React 审查（优先级：P1）
- 核查轮询：所有 `setInterval` 是否 visibility-aware、是否在 unmount 清理、是否与 WS 叠加
- 核查 `useEffect` 依赖与副作用：是否存在 setState-in-effect、依赖缺失导致 stale closure
- 核查内存泄漏：事件监听器、WS 订阅、AbortController 是否正确清理
- 核查错误边界与加载状态：是否覆盖 `error.tsx` / `loading.tsx` / Suspense
- 核查可访问性与键盘导航（关键交互）

### 6. 类型安全与代码质量收敛（优先级：P2）
- 收敛 `lib/` 与 `app/api/` 中的 `any`（业务核心层优先）
- 清理 `console.log` / `console.debug`（保留 warn/error/info）
- 核查未使用变量、缺失依赖（ESLint warn 项）
- 核查命名规范一致性（参考 docs/NAMING_CONVENTION.md）

### 7. 配置、部署与运维审查（优先级：P2）
- 核查 `.env.example` 与代码引用的环境变量是否齐全
- 核查 Dockerfile / docker-compose.yml 健康检查、资源限制、日志配置
- 核查 `server.ts` 自定义服务器的优雅关闭、WS 与 HTTP 端口协调
- 核查 husky / lint-staged / CI 流程可用性

### 8. 测试覆盖评估（优先级：P2）
- 评估当前测试覆盖范围，列出无测试保障的高风险模块
- 为评测机、权限、AI 解析等核心逻辑补充关键路径单元测试（如资源解析、超时判定、角色判定）
- 不要求达到高覆盖率，聚焦回归风险最高的纯函数

## Impact

- Affected specs: 评测机相关（optimize-judger-timeout-memory、fix-judger-defects-round2、refactor-judger-traditional）、AI 生成相关（fix-ai-generation-defects、deepseek-ai-call-optimization、concurrent-single-problem-generation）、权限相关（unify-permission-system、remove-permission-points-unify-roles、fix-permission-usage）、前端修复相关（add-submission-result-modal、fix-current-page-errors）
- Affected code:
  - 全部 `app/api/**/route.ts`（约 100 个路由，鉴权与校验核查）
  - `lib/judge/*`（评测机正确性）
  - `lib/ai/*`（类型安全与队列健壮性）
  - `lib/permissions.ts`、`lib/auth.ts`、`middleware.ts`、`lib/rate-limit.ts`（安全）
  - `lib/api/handler.ts`、`lib/api/withApi.ts`（错误处理与鉴权封装）
  - `lib/prisma.ts`、`prisma/schema.prisma`（数据层）
  - 21 个含 `setInterval` 的前端文件（轮询核查）
  - `tests/`（补充测试）

## ADDED Requirements

### Requirement: 全 API 路由鉴权审计

系统所有 `app/api/**/route.ts` 必须经由统一鉴权封装（`withApi` / `withApi.admin` / 公开白名单），不存在绕过中间件的未鉴权写接口。

#### Scenario: 未鉴权写接口
- **WHEN** 审计发现某 POST/PUT/PATCH/DELETE 路由未调用 `withApi`
- **THEN** 标记为 P0 缺陷并补齐鉴权

#### Scenario: 权限越权
- **WHEN** 普通用户可调用管理员接口或越权操作他人资源
- **THEN** 标记为 P0 缺陷并补齐权限校验

### Requirement: 评测机资源统计与超时正确性

评测机 CPU 时间与峰值内存统计需准确，超时窗口与 rejudge 逻辑需与 spec（optimize-judger-timeout-memory、fix-judger-defects-round2）一致，临时文件与子进程需可靠回收。

#### Scenario: 资源统计跨平台
- **WHEN** 在 Docker 容器内执行评测
- **THEN** CPU 时间与 VmHWM 内存读取正确，不因 `/usr/bin/time` 缺失而崩溃

#### Scenario: 临时文件泄漏
- **WHEN** 评测异常中断
- **THEN** 编译产物与运行临时目录被清理，无残留

### Requirement: AI 模块类型安全收敛

`lib/ai/*` 中的 `any` 使用需收敛为具体类型（OpenAI SDK 类型或自定义接口），关键纯函数（response-parser、quality-check）需有类型保障。

#### Scenario: 响应解析类型安全
- **WHEN** AI 返回非预期 JSON 结构
- **THEN** 解析器返回类型化结果或抛出明确错误，不产生 `any` 透传

### Requirement: 前端轮询统一规范

所有 `setInterval` 轮询需满足：页面隐藏时暂停、组件卸载时清理、不与 WebSocket 事件重复触发同一数据刷新。

#### Scenario: 后台轮询
- **WHEN** 页面切到后台
- **THEN** 轮询暂停，恢复前台后继续

### Requirement: 核心逻辑测试保障

评测机资源解析、超时判定、权限角色判定、AI 响应解析等高风险纯函数需有单元测试覆盖关键路径。

#### Scenario: 回归测试
- **WHEN** 修改评测机或 AI 解析逻辑
- **THEN** 运行 `npm test` 通过，覆盖关键边界（空输入、超时、格式异常）

## MODIFIED Requirements

无（本次为审查型规范，不修改既有需求定义，仅在发现缺陷时按缺陷修复）。

## REMOVED Requirements

无。

## 审查执行原则

1. **审查与修复分离**：先全量扫描产出问题清单（按 P0/P1/P2 分级），再按优先级修复。
2. **最小改动**：修复以收敛缺陷为目标，不做无关重构、不扩大范围。
3. **不回滚用户改动**：工作区可能存在与本规范无关的用户改动，保持原样。
4. **验证闭环**：每个修复需通过 `npx tsc --noEmit` 与 `npx eslint`，核心模块补测试。
5. **分级处理**：P0 必须全部修复；P1 应修复，遗留项需明确记录；P2 按性价比处理。
