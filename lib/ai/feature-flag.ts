/**
 * AI 功能下线开关（集中控制）
 *
 * 业务决策（2026-07）：AI 出题流程存在测试点正确性与覆盖度判定的待解决问题，
 * 暂时下架所有 AI 相关功能，避免用户继续触达有问题的流程。
 *
 * 恢复方式：将 AI_FEATURE_DISABLED 改为 false，所有 AI 入口会自动恢复可用。
 *
 * 影响范围：
 * - 管理员侧边栏"AI 助手"菜单组（AI 工作区 / AI 模型管理 / AI 任务监控）
 * - 管理员仪表盘 AI 相关卡片（AI 任务 / AI 成本 / AI 出题快捷入口）
 * - AI 工作区页面 /admin/ai
 * - AI 模型管理页面 /admin/ai-models
 * - AI 任务监控页面 /admin/ai-monitor
 * - 题目编辑页 ProblemAiPanel（重新生成题解 / 智能分析 / 建议元数据 / 生成相似题）
 * - 测试用例管理页 AI 生成测试数据链接
 */

export const AI_FEATURE_DISABLED = true

export const AI_DISABLED_TITLE = 'AI 功能暂时下架'

export const AI_DISABLED_REASON =
  'AI 出题流程正在修复测试点正确性与覆盖度判定问题，暂时下架所有 AI 相关功能，恢复时间待定。'

export const AI_DISABLED_BADGE = '功能异常'
