export interface Provider {
  id: string
  name: string
  slug: string
  baseUrl: string | null
  apiKey: string | null
  isActive: boolean
}

export interface AIModel {
  id: string
  name: string
  model: string
  providerId: string
  type: string
  maxTokens: number
  temperature: number
  isActive: boolean
  params?: Record<string, any>
  /** Task 35.5: 每百万 tokens 单价（用于成本估算，单位：元） */
  pricePerMillionTokens?: number | null
  /** Phase 6 Task 38: 模型健康状态（'healthy' | 'degraded' | 'down' | null） */
  healthStatus?: string | null
  /** Phase 6 Task 38: 最近健康检查时间 */
  lastHealthCheckAt?: string | null
  provider?: {
    name: string
    slug: string
  }
}

export interface ProviderPreset {
  slug: string
  name: string
  baseUrl: string
  apiFormat?: 'openai' | 'anthropic' | 'both'
  anthropicBaseUrl?: string
  defaultModels: Array<{
    name: string
    model: string
    type?: 'generation' | 'thinking'
    supportsThinkingParam?: boolean
  }>
}

export interface DiscoveredModel {
  model: string
  name: string
  type: 'generation' | 'thinking'
  supportsThinkingParam?: boolean
  deprecated?: boolean
  description?: string
}

export interface ProviderFormState {
  name: string
  slug: string
  baseUrl: string
  apiKey: string
}

export interface ModelFormState {
  name: string
  model: string
  providerId: string
  type: string
  maxTokens: number
  temperature: number
  pricePerMillionTokens: number | null
}
