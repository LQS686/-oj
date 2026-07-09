# Checklist

## 阶段一：扫描产出（问题清单已生成且分级）

- [x] 安全与鉴权扫描完成，产出未鉴权写接口、硬编码角色比较、缺失输入校验、敏感信息泄露、限流缺口的问题清单（P0/P1/P2 分级）
- [x] 评测机扫描完成，产出资源统计、跨平台兼容、超时/rejudge、并发控制、临时文件/子进程回收的问题清单
- [x] AI 模块扫描完成，产出 `any` 清单、队列幂等/重试/超时、provider 一致性、解析与质量门禁健壮性的问题清单
- [x] 后端 API 与数据层扫描完成，产出 N+1/缺索引/未分页/事务/错误处理/`stats` 契约/索引完整性的问题清单
- [x] 前端扫描完成，产出轮询 visibility-aware/清理、WS 叠加、setState-in-effect、内存泄漏、错误边界的问题清单
- [x] 配置/部署/测试覆盖扫描完成，产出环境变量缺口、Docker/server.ts 问题、高风险无测试模块清单

## 阶段二：修复（按优先级）

### P0 安全与鉴权
- [x] 所有未鉴权的写接口（POST/PUT/PATCH/DELETE）已补齐 `withApi` 鉴权
- [x] 所有硬编码 `role === 'xxx'` 比较已替换为 `lib/permissions.ts` 函数
- [x] 关键写接口的输入校验已补全（body/query/param）
- [x] JWT payload 仅含 userId/email/username/role，错误响应不泄露堆栈/内部信息
- [x] `console.log` 不再打印密码、token、用户敏感数据

### P0 评测机
- [x] Docker 环境下 CPU 时间与 VmHWM 内存读取正确，`/usr/bin/time` 缺失时有降级
- [x] 超时窗口与 rejudge 逻辑与 spec（optimize-judger-timeout-memory、fix-judger-defects-round2）一致
- [x] 评测异常中断时编译产物与运行临时目录被清理，无残留
- [x] 子进程僵尸被回收，并发控制与任务超时回收正常

### P1 AI 模块
- [x] `lib/ai/*` 关键纯函数（response-parser、quality-check）的 `any` 已收敛为具体类型
- [x] 队列任务幂等、失败重试有界、超时回收生效
- [x] 响应对非预期 JSON 结构有明确错误处理，不产生 `any` 透传
- [x] provider/model 配置校验完整，密钥不进日志

### P1 后端 API
- [x] 未分页列表接口已补分页或确认无性能风险
- [x] 高风险 N+1 查询已修复
- [x] 多表写入操作使用事务
- [x] 错误处理统一经 `lib/api/handler.ts`，无吞异常的空 catch
- [x] `stats` 字段在班级列表/详情接口一致返回 assignmentCount/problemCount/noteCount
- [x] schema 高频查询字段索引完整

### P1 前端
- [x] 所有 `setInterval` 轮询在页面隐藏时暂停、卸载时清理
- [x] WS 与轮询不重复触发同一数据刷新
- [x] 无 `setState-in-effect` 导致的级联渲染
- [x] 事件监听器/WS 订阅/AbortController 在卸载时清理
- [x] 关键页面有 `error.tsx`/加载状态覆盖

### P2 类型安全与代码质量
- [x] `lib/` 与 `app/api/` 中 `console.log`/`console.debug` 已清理（保留 warn/error/info）
- [x] 业务核心层 `any` 已收敛（AI 模块、contest/service.ts 等）
- [x] ESLint `warn` 项无新增（未使用变量、缺失依赖、`no-explicit-any`）

### P2 配置与部署
- [x] `.env.example` 覆盖代码引用的全部环境变量
- [x] Docker 配置含健康检查，无已知资源/日志问题
- [x] `server.ts` 优雅关闭与 WS/HTTP 端口协调正常

### 测试
- [x] 评测机资源解析、超时判定有单元测试
- [x] 权限角色判定有单元测试
- [x] AI 响应解析有单元测试（覆盖正常与异常 JSON）

## 阶段三：验证回归
- [x] `npx tsc --noEmit` 无新增错误
- [x] `npx eslint` 无新增 error，warn 项不增加
- [x] `npm test` 全部通过
- [x] 所有 P0 缺陷已修复
- [x] 所有 P1 缺陷已修复或明确记录遗留原因
- [x] 修复未引入跨模块回归（类型契约、前端轮询、Docker 兼容）

## 遗留（预存在，非本次审计引入）

> 以下 tsc/eslint 错误在本次审计**开始前已存在**（经 git status 核对，对应文件均不在审计修改清单内），
> 因修复涉及结构性改动（需新建模块/调整 schema/Lucide API 变更），超出本次审查范围，记录为遗留待后续处理。

**tsc 预存在错误（6 文件）**：
- `app/api/admin/ai/solution/status/route.ts:31` — `logId` 为 `string | null`，`throw400` 返回 void 未触发类型收窄
- `app/api/admin/announcements/route.ts:29-30` — `body.title`/`body.content` 为 `string | undefined`，同上类型收窄问题
- `app/api/classes/[id]/notes/[noteId]/read/route.ts:8` — 引用不存在的 `@/lib/points/award` 模块（积分功能未实现）
- `app/classes/page.tsx:575,577`、`components/training/TrainingCard.tsx:91` — Lucide React 新版移除图标 `title` prop
- `lib/category/service.ts:13,20,22` — `prisma.category` 不存在（schema 仅有 `TrainingCategory`，无独立 `Category` 模型）

**eslint 预存在 errors（3 项）**：
- `hooks/useSubmissionSocket.ts:183` — `react-hooks/refs` 规则：在渲染期间访问 `socketRef.current`
- `scripts/e2e-ai-generation.ts:19` — `@typescript-eslint/no-require-imports`：`require()` 风格导入

> 本次审计已修复 2 项回归：AI config route.ts 解构回归、training problem 页 `showResultModal` 未声明状态。
