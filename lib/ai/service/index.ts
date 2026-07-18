/**
 * lib/ai/service/index.ts
 * AI 业务层统一 facade — 所有外部模块（API 路由、其他 service）调用 AI 能力时必须通过本入口，
 * 禁止直接 import 底层 enqueueSolutionJob / enqueueAiGeneration / addAiJob 等队列函数。
 *
 * 原始 lib/ai/service.ts 已按业务域拆分为 lib/ai/service/ 目录下的多个子模块：
 * - types.ts        常量 + 类型定义
 * - logs.ts         日志查询/清理（listUserAiTasks / listAllAiLogs / cleanupStuckAiTasks 等）
 * - generation.ts   题目生成/预览/入库（enqueueAiGeneration / commitPreviewedProblem 等）
 * - solution.ts     题解/分析/元数据（enqueueSolutionRegeneration / enqueueProblemAnalysis 等）
 * - capabilities.ts 能力清单（getAiCapabilities / getModelRecommendations / resetModelHealth）
 * - models.ts       用户模型偏好（listActiveAiModelsForUser / upsertUserAiPreference 等）
 * - providers.ts    Provider 管理 + 全局配置 + 连通性测试
 *
 * 提供的能力入口：
 * - 题目生成：enqueueAiGeneration / retryAiGeneration / enqueueBatchGeneration（Phase 6）
 * - 题解生成：enqueueSolutionForNewProblem / enqueueSolutionRegeneration
 * - 题目分析：enqueueProblemAnalysis
 * - 元数据建议：enqueueMetadataSuggestion
 * - 任务管理：listUserAiTasks / listRecentAiLogs（别名） / cancelAiJob / getAiLogById
 * - 能力清单：getAiCapabilities
 * - 模型管理：listActiveAiModelsForUser / listUserAiPreferences / upsertUserAiPreference / ...
 * - Provider 管理：listAiProvidersForAdmin / createAiProvider / updateAiProvider / ...
 */
// Barrel re-export — 保持 @/lib/ai/service 入口兼容
export * from './types'
export * from './logs'
export * from './generation'
export * from './solution'
export * from './capabilities'
export * from './models'
export * from './providers'
