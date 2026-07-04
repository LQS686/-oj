# AI 生成功能缺陷修复 - 检查清单

## 配置传递链
- [x] getAiConfig 返回 maxTokens/temperature/timeout 字段
- [x] createAiClient 接受并设置 OpenAI client timeout
- [x] generateProblems 优先使用 config.maxTokens（thinking 模式下 *2）
- [x] generateProblems 优先使用 config.temperature 作为基础温度
- [x] runThinkingStep 优先使用 config.maxTokens
- [x] solution-generator 消费 config.maxTokens/temperature
- [x] thinkingApiKey 缺失且 thinkingProvider !== provider 时抛错（不回退主 apiKey）
- [x] testAiConnection 遵循同样规则

## thinking 模式
- [x] runThinkingStep content 读取顺序为 `content || reasoning_content || ''`
- [x] disableThinking 通过 delete filtered.thinking 实现
- [x] disableThinking 时 reasoning_effort 设为 'low'

## 解析器与重试
- [x] stripThinkBlocks 使用非贪婪 `[\s\S]*?`
- [x] stripThinkBlocks 循环处理多个独立 think 块
- [x] generateSolutionForProblem 解析失败时重试 2 次（0.2 → 0.0）
- [x] retryAiGeneration 的 reduceTemperature 用 `??` 而非 `||`

## 并发与状态
- [x] problemNumber unique 冲突时自动重试（最多 3 次）
- [x] SolutionQueue maxConcurrent=2
- [x] AiQueue executeJob 用 try-finally 清理 processing Map
- [x] AiQueue executeJob 有 5 分钟超时保护
- [x] SolutionQueue 有超时保护
- [x] SolutionQueue 有 stuck job 检测

## 数据一致性
- [x] PARAM_GEN 创建 Problem 时保存 stdCode/stdLang
- [x] SolutionQueue deleteMany + create 包裹 prisma.$transaction
- [x] AiQueue deleteMany + create 包裹 prisma.$transaction
- [x] PARAM_GEN 质量门禁未通过时 isPublic=false

## 端到端流程
- [x] 新增 GET /api/admin/ai/solution/status?logId=xxx 端点
- [x] 端点返回 { status, solution?, error? }
- [x] 前端 regenerate-solution 后启动 2s 轮询
- [x] 轮询 COMPLETED 时自动 fetchSolutions
- [x] 轮询 FAILED 时展示错误
- [x] 轮询增加可见性感知

## 验证
- [x] `npx tsc --noEmit` 无新增错误
- [x] eslint 无新增警告
