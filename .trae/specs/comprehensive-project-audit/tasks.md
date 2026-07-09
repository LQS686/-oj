# Tasks

## 阶段一：全量扫描与问题清单（审查，不改代码）

- [x] Task 1: 安全与鉴权扫描 — 扫描全部 `app/api/**/route.ts`，核查是否经由 `withApi`/`withApi.admin` 鉴权、是否存在未鉴权写接口、是否存在硬编码 `role === 'xxx'` 绕过 `lib/permissions.ts`、输入校验是否缺失。产出分级问题清单。
  - [ ] SubTask 1.1: 扫描所有 POST/PUT/PATCH/DELETE 路由的鉴权封装使用情况
  - [ ] SubTask 1.2: 核查权限校验是否统一走 `lib/permissions.ts`，找出硬编码角色比较
  - [ ] SubTask 1.3: 核查输入校验（body/query/param）覆盖情况
  - [ ] SubTask 1.4: 核查 JWT payload 最小化、错误响应是否泄露内部信息、`console.log` 是否打印敏感数据
  - [ ] SubTask 1.5: 核查 `middleware.ts` 限流覆盖与文件上传/评测沙箱安全
- [x] Task 2: 评测机正确性扫描 — 审查 `lib/judge/*`（executor/compiler/judger/queue/worker/comparator/runner.sh）近期改动，核查资源统计准确性、跨平台兼容、超时窗口、rejudge 逻辑、并发控制、临时文件与子进程回收。产出问题清单。
  - [ ] SubTask 2.1: 核查 CPU 时间/VmHWM 内存读取在 Docker 下的正确性
  - [ ] SubTask 2.2: 核查超时窗口与 rejudge 逻辑与 spec 一致性
  - [ ] SubTask 2.3: 核查临时文件清理、编译产物泄漏、僵尸进程回收
  - [ ] SubTask 2.4: 核查并发控制、任务超时与失败回收
- [x] Task 3: AI 生成模块扫描 — 审查 `lib/ai/*`，核查 `any` 使用、队列幂等性/重试/超时、provider/model 一致性、配置与密钥管理、质量门禁与响应解析健壮性。产出问题清单。
  - [ ] SubTask 3.1: 清点 `lib/ai/*` 中 `any` 使用位置与影响
  - [ ] SubTask 3.2: 核查 queue.ts / solution-queue.ts 幂等、重试、超时回收
  - [ ] SubTask 3.3: 核查 response-parser.ts / quality-check.ts 对异常输入的健壮性
  - [ ] SubTask 3.4: 核查 AI 任务与评测机、前端的时序契约
- [x] Task 4: 后端 API 与数据层扫描 — 核查 N+1 查询、缺索引查询、未分页列表、事务使用、统一错误处理、`stats` 字段契约一致性、schema 索引完整性。产出问题清单。
  - [ ] SubTask 4.1: 扫描未分页列表接口与潜在 N+1 查询
  - [ ] SubTask 4.2: 核查多表写入操作的事务使用
  - [ ] SubTask 4.3: 核查错误处理是否统一经 `lib/api/handler.ts`、空 catch 清单
  - [ ] SubTask 4.4: 核查 `stats` 字段契约一致性（assignmentCount/problemCount/noteCount）
  - [ ] SubTask 4.5: 核查 prisma schema 索引完整性
- [x] Task 5: 前端与 React 扫描 — 核查 21 个含 `setInterval` 文件的 visibility-aware 与清理、`useEffect` 依赖与 setState-in-effect、事件监听/WS 订阅内存泄漏、错误边界与加载状态覆盖。产出问题清单。
  - [ ] SubTask 5.1: 核查所有 `setInterval` 的 visibility-aware 与 unmount 清理
  - [ ] SubTask 5.2: 核查 WS 与轮询是否叠加触发同一数据刷新
  - [ ] SubTask 5.3: 核查 `useEffect` 依赖与 setState-in-effect
  - [ ] SubTask 5.4: 核查事件监听器/WS 订阅/AbortController 清理
  - [ ] SubTask 5.5: 核查错误边界与加载状态覆盖
- [x] Task 6: 配置/部署/测试覆盖扫描 — 核查 `.env.example` 与代码引用环境变量齐全性、Docker 配置、`server.ts` 优雅关闭、当前测试覆盖范围与高风险无测试模块。产出问题清单。
  - [ ] SubTask 6.1: 核查环境变量齐全性（`.env.example` vs 代码引用）
  - [ ] SubTask 6.2: 核查 Docker 健康检查/资源限制/日志配置
  - [ ] SubTask 6.3: 核查 `server.ts` 优雅关闭与端口协调
  - [ ] SubTask 6.4: 评估测试覆盖范围，列出高风险无测试模块

## 阶段二：分级修复（按问题清单优先级执行）

- [x] Task 7: 修复 P0 安全与鉴权缺陷 — 补齐未鉴权路由、修复权限越权、补全缺失输入校验、移除敏感信息泄露。
- [x] Task 8: 修复 P0 评测机缺陷 — 修复资源统计/超时/rejudge/清理相关的正确性与稳定性问题。
- [x] Task 9: 修复 P1 AI 模块缺陷 — 收敛关键 `any`、修复队列幂等/重试/超时、加固响应解析与质量门禁。
- [x] Task 10: 修复 P1 后端 API 缺陷 — 修复 N+1/缺索引/未分页/事务/错误处理/`stats` 契约问题。
- [x] Task 11: 修复 P1 前端缺陷 — 修复轮询 visibility-aware/清理、setState-in-effect、内存泄漏、错误边界。
- [x] Task 12: 修复 P2 类型安全与代码质量 — 清理 `console.log`/`debug`、收敛业务层 `any`、修复 ESLint warn 项。
- [x] Task 13: 修复 P2 配置与部署问题 — 补齐环境变量、修复 Docker/server.ts 配置问题。
- [x] Task 14: 补充核心逻辑测试 — 为评测机资源解析、超时判定、权限角色判定、AI 响应解析补充单元测试。

## 阶段三：验证与回归

- [x] Task 15: 全量验证 — 运行 `npx tsc --noEmit`、`npx eslint`、`npm test`，确认无新增错误；核对所有 P0/P1 缺陷已修复或记录遗留。

# Task Dependencies

- Task 7–14 依赖 Task 1–6 的问题清单产出
- Task 15 依赖 Task 7–14 完成
- Task 1–6 之间无强依赖，可并行执行
