/**
 * 模型弃用检测工具
 *
 * 集中管理"即将弃用"或"已弃用"的模型 ID 清单。
 * 服务端可通过模型 ID 自动追加 deprecation 信息，前端可显示警告。
 */

export interface ModelDeprecation {
  /** 弃用的模型 ID */
  model: string
  /** 提供商 slug */
  provider: string
  /** 弃用日期（ISO） */
  deprecatedAt: string
  /** 推荐替代模型 */
  replacement: string
  /** 弃用原因 */
  reason: string
}

export const DEPRECATED_MODELS: ModelDeprecation[] = [
  {
    model: 'deepseek-chat',
    provider: 'deepseek',
    deprecatedAt: '2026-07-24T23:59:00+08:00',
    replacement: 'deepseek-v4-flash',
    reason: 'DeepSeek v4 发布，旧 ID 自动映射到 v4-flash 非思考模式'
  },
  {
    model: 'deepseek-reasoner',
    provider: 'deepseek',
    deprecatedAt: '2026-07-24T23:59:00+08:00',
    replacement: 'deepseek-v4-flash',
    reason: 'DeepSeek v4 发布，旧 ID 自动映射到 v4-flash 思考模式'
  }
]

/**
 * 检查模型是否已弃用
 * @param modelId 模型 ID
 * @param providerSlug 服务商 slug（可选，传入时匹配更精确）
 * @returns 如果弃用则返回 deprecation 信息，否则返回 null
 */
export function getDeprecation(modelId: string, providerSlug?: string): ModelDeprecation | null {
  return DEPRECATED_MODELS.find(d =>
    d.model === modelId && (!providerSlug || d.provider === providerSlug)
  ) || null
}

/**
 * 检查模型是否即将弃用（30 天内）
 */
export function isModelDeprecatedSoon(modelId: string, providerSlug?: string): boolean {
  const dep = getDeprecation(modelId, providerSlug)
  if (!dep) return false
  const now = Date.now()
  const depTime = new Date(dep.deprecatedAt).getTime()
  const thirtyDays = 30 * 24 * 60 * 60 * 1000
  return depTime - now < thirtyDays
}
