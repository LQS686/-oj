'use client'

import { useState, useEffect, useMemo } from 'react'
import { Check, ChevronsUpDown, Loader2, Cpu, Zap, ThumbsUp, AlertTriangle, HeartOff } from 'lucide-react'
import { fetchWithCookie } from '@/lib/api/base'

interface Model {
  id: string
  name: string
  model: string
  type: string // 'generation' | 'thinking'
  providerName: string
  providerSlug?: string
  maxTokens?: number
  temperature?: number
  /** Phase 6 Task 37.2: 推荐模型标记 */
  isRecommended?: boolean
  /** Phase 6 Task 38.2: 模型健康状态（'healthy' | 'degraded' | 'down' | null） */
  healthStatus?: string | null
}

interface AiModelPickerProps {
  value?: string
  onChange: (value: string) => void
  className?: string
  showThinking?: boolean // Whether to show thinking models
}

/**
 * Phase 6 Task 37.3 / 38.3: 模型排序
 *
 * 排序规则：
 * 1. 推荐模型（isRecommended=true）置顶
 * 2. 健康模型（healthStatus 为 'healthy' 或 null/undefined）居中
 * 3. degraded 状态靠后
 * 4. down 状态置底
 *
 * 同档位内保持原始顺序（API 返回顺序）
 */
function getModelHealthRank(model: Model): number {
  const h = (model.healthStatus || '').toLowerCase()
  if (h === 'down') return 3
  if (h === 'degraded') return 2
  return 1 // healthy / null / unknown
}

function sortModels(models: Model[]): Model[] {
  return [...models].sort((a, b) => {
    // 推荐置顶
    const ra = a.isRecommended ? 0 : 1
    const rb = b.isRecommended ? 0 : 1
    if (ra !== rb) return ra - rb
    // 健康度排序
    const ha = getModelHealthRank(a)
    const hb = getModelHealthRank(b)
    if (ha !== hb) return ha - hb
    return 0
  })
}

export function AiModelPicker({ value, onChange, className = '', showThinking = true }: AiModelPickerProps) {
  const [models, setModels] = useState<Model[]>([])
  const [loading, setLoading] = useState(true)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    fetchModels()
  }, [])

  const fetchModels = async () => {
    try {
      setLoading(true)
      const res = await fetchWithCookie('/api/ai/models')
      const data = await res.json()
      if (data.success) {
        const allModels = data.data.models as Model[]
        // Filter models if needed
        const filtered = showThinking ? allModels : allModels.filter(m => m.type !== 'thinking')
        // Phase 6 Task 37.3 / 38.3: 推荐置顶 + 健康状态排序
        setModels(sortModels(filtered))

        // Set default if not provided
        if (!value && data.data.defaultModelId) {
          const defaultModel = filtered.find(m => m.id === data.data.defaultModelId)
          if (defaultModel) {
            onChange(defaultModel.id)
          } else if (filtered.length > 0) {
            onChange(filtered[0].id)
          }
        } else if (!value && filtered.length > 0) {
          onChange(filtered[0].id)
        }
      }
    } catch (error) {
      console.error('Failed to fetch models', error)
    } finally {
      setLoading(false)
    }
  }

  const selectedModel = models.find(m => m.id === value)

  /**
   * Phase 6 Task 37.3 / 38.3: 渲染模型徽章（推荐 + 健康状态）
   */
  const renderModelBadges = (model: Model, inline = false) => {
    const badges: React.ReactNode[] = []

    if (model.isRecommended) {
      badges.push(
        <span
          key="recommended"
          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700 ${
            inline ? 'ml-1' : ''
          }`}
          title="基于近 30 天成功率与平均耗时推荐"
        >
          <ThumbsUp className="w-2.5 h-2.5" />
          推荐
        </span>
      )
    }

    const health = (model.healthStatus || '').toLowerCase()
    if (health === 'degraded') {
      badges.push(
        <span
          key="degraded"
          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 ${
            inline ? 'ml-1' : ''
          }`}
          title="近 7 天有连续失败，可用性下降"
        >
          <AlertTriangle className="w-2.5 h-2.5" />
          降级
        </span>
      )
    } else if (health === 'down') {
      badges.push(
        <span
          key="down"
          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700 ${
            inline ? 'ml-1' : ''
          }`}
          title="近 7 天连续失败多次，模型不可用"
        >
          <HeartOff className="w-2.5 h-2.5" />
          不可用
        </span>
      )
    }

    return badges.length > 0 ? <>{badges}</> : null
  }

  // Phase 6 Task 37.3: 是否禁选 down 状态模型（仍可选，但需视觉提示）
  const isModelDisabled = (model: Model): boolean => {
    const health = (model.healthStatus || '').toLowerCase()
    return health === 'down'
  }

  const sortedModels = useMemo(() => models, [models])

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={loading}
        className="w-full flex items-center justify-between px-3 py-2 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all text-sm"
      >
        {loading ? (
          <span className="flex items-center gap-2 text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            加载模型中...
          </span>
        ) : selectedModel ? (
          <span className="flex items-center gap-2 text-gray-800 flex-1 min-w-0">
            {selectedModel.type === 'thinking' ? (
              <Cpu className="w-4 h-4 text-purple-600 flex-shrink-0" />
            ) : (
              <Zap className="w-4 h-4 text-blue-600 flex-shrink-0" />
            )}
            <span className="font-medium truncate">{selectedModel.name}</span>
            <span className="text-xs text-gray-500 ml-1 flex-shrink-0">({selectedModel.providerName})</span>
            {renderModelBadges(selectedModel, true)}
          </span>
        ) : (
          <span className="text-gray-500">选择 AI 模型...</span>
        )}
        <ChevronsUpDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
      </button>

      {isOpen && !loading && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
            {sortedModels.length === 0 ? (
              <div className="p-3 text-center text-gray-500 text-sm">无可用模型</div>
            ) : (
              <div className="py-1">
                {sortedModels.map(model => {
                  const disabled = isModelDisabled(model)
                  return (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => {
                        if (disabled) return
                        onChange(model.id)
                        setIsOpen(false)
                      }}
                      disabled={disabled}
                      className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${
                        value === model.id ? 'bg-purple-50 text-purple-700' : 'text-gray-700'
                      } ${disabled ? 'opacity-50 cursor-not-allowed hover:bg-transparent' : ''}`}
                      title={disabled ? '该模型当前不可用（连续失败次数过多）' : undefined}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {model.type === 'thinking' ? (
                          <Cpu className="w-4 h-4 text-purple-500 flex-shrink-0" />
                        ) : (
                          <Zap className="w-4 h-4 text-blue-500 flex-shrink-0" />
                        )}
                        <div className="flex flex-col items-start min-w-0 flex-1">
                          <span className="font-medium flex items-center flex-wrap gap-1">
                            <span className="truncate">{model.name}</span>
                            {model.type === 'thinking' && <span className="text-xs text-purple-500">🧠</span>}
                            {renderModelBadges(model, true)}
                          </span>
                          <span className="text-xs text-gray-500 truncate">
                            {model.providerName} · {model.model}
                            {model.maxTokens ? ` · 📏 ${model.maxTokens}` : ''}
                          </span>
                        </div>
                      </div>
                      {value === model.id && <Check className="w-4 h-4 text-purple-600 flex-shrink-0" />}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default AiModelPicker
