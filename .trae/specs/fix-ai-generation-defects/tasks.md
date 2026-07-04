# AI 生成功能缺陷修复 - 任务清单

## 阶段一：配置传递链修复

### Task 1: AiModel 配置字段生效（A1）
- [x] 1.1: `lib/ai/config.ts` getAiConfig 返回 maxTokens/temperature/timeout（从 aiModel 读取，legacy fallback 也补齐）
- [x] 1.2: `lib/ai/factory.ts` createAiClient 接受 timeout 参数，设置 OpenAI client timeout
- [x] 1.3: `lib/ai/generator.ts` generateProblems 与 runThinkingStep 优先使用 config.maxTokens（thinking 模式下 *2），config.temperature 作为基础温度
- [x] 1.4: `lib/ai/solution-generator.ts` 同样消费 config.maxTokens/temperature

### Task 2: thinkingApiKey 安全约束（A2、A4）
- [x] 2.1: `lib/ai/factory.ts` createAiClient 当 enableThinking && thinkingProvider !== provider && !thinkingApiKey 时抛错
- [x] 2.2: `lib/ai/service.ts` testAiConnection 遵循同样规则，不再回退到主 apiKey

## 阶段二：thinking 模式修复

### Task 3: thinking content 读取顺序统一（F1、F2）
- [x] 3.1: `lib/ai/generator.ts` runThinkingStep 改为 `msg?.content || msg?.reasoning_content || ''`

### Task 4: disableThinking 改为删除字段（F3）
- [x] 4.1: `lib/ai/generator.ts` tryGenerate 的 disableThinking 分支改为 `delete filtered.thinking`，同时设 `reasoning_effort: 'low'`

## 阶段三：解析器与重试

### Task 5: stripThinkBlocks 非贪婪匹配（I2）
- [x] 5.1: `lib/ai/response-parser.ts` 改为 `/<think>[\s\S]*?<\/think>/gi`，循环替换

### Task 6: 题解生成重试（B1）
- [x] 6.1: `lib/ai/solution-generator.ts` generateSolutionForProblem 增加 tryGenerate 包装，解析失败时降温度 0.2 → 0.0 + 强提示，重试 2 次

### Task 7: retryAiGeneration reduceTemperature 修复（B2）
- [x] 7.1: `lib/ai/service.ts` `reduceTemperature || true` 改为 `reduceTemperature ?? true`

## 阶段四：并发与状态

### Task 8: problemNumber 竞态修复（D1）
- [x] 8.1: `lib/ai/queue.ts` executeJob 创建 Problem 时，problemNumber 冲突重试（catch P2002，重新查 max +1，最多 3 次）

### Task 9: SolutionQueue 并发限制（D2）
- [x] 9.1: `lib/ai/solution-queue.ts` 增加 maxConcurrent=2，processQueue 限制并发

### Task 10: AiQueue executeJob finally 清理（C3）
- [x] 10.1: `lib/ai/queue.ts` executeJob 用 try-finally 确保 `this.processing.delete(job.id)` 执行，catch 块内 DB 操作失败不影响清理

### Task 11: AI 任务超时保护（C1、C2）
- [x] 11.1: `lib/ai/queue.ts` executeJob 外层 Promise.race + 超时（默认 5 分钟，环境变量 AI_JOB_TIMEOUT_MS 可配）
- [x] 11.2: `lib/ai/solution-queue.ts` 同样加超时保护
- [x] 11.3: SolutionQueue 增加 stuck job 检测（参考 AiQueue 的 isStuckLog）

## 阶段五：数据一致性

### Task 12: PARAM_GEN 保存 stdCode（E1）
- [x] 12.1: `lib/ai/queue.ts` PARAM_GEN 创建 Problem 的 data 中加 `stdCode: problem.solution_cpp || problem.solution_python || null, stdLang: problem.solution_cpp ? 'cpp' : (problem.solution_python ? 'python' : null)`

### Task 13: SolutionQueue 事务（I1）
- [x] 13.1: `lib/ai/solution-queue.ts` deleteMany + create 包裹 `prisma.$transaction`
- [x] 13.2: `lib/ai/queue.ts` 同样的 deleteMany + create 也包裹事务

### Task 14: 自动发布质量门禁（H4）
- [x] 14.1: `lib/ai/queue.ts` PARAM_GEN 创建 Problem 时，`isPublic: !qualityIssues?.length`，`visibility: qualityIssues?.length ? 'private' : 'public'`

## 阶段六：端到端流程

### Task 15: 题解状态查询 API（B3）
- [x] 15.1: 新建 `app/api/admin/ai/solution/status/route.ts`，GET 接受 logId，调用 `getSolutionJobStatus`，返回 { status, solution?, error? }

### Task 16: 题解前端轮询（H1）
- [x] 16.1: `app/admin/problems/[id]/edit/page.tsx` regenerate-solution 返回 logId 后启动 2s 轮询 `/api/admin/ai/solution/status?logId=xxx`
- [x] 16.2: 轮询返回 COMPLETED 时自动 fetchSolutions，FAILED 时展示错误
- [x] 16.3: 轮询增加可见性感知（页面不可见时暂停）

## 阶段七：验证

### Task 17: 编译与 lint 验证
- [x] 17.1: `npx tsc --noEmit` 无新增错误
- [x] 17.2: `npx eslint lib/ai/ app/api/admin/ai/ "app/admin/ai-generation/page.tsx" "app/admin/problems/[id]/edit/page.tsx" --max-warnings 0`（预先存在的警告可忽略）

# Task Dependencies
- Task 2 依赖 Task 1（factory 改动需先有 config 字段）
- Task 11 依赖 Task 10（超时保护需 finally 清理就位）
- Task 16 依赖 Task 15（前端轮询需 API 端点存在）
- 其余任务可并行
