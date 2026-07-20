import { Plus, Trash2, Edit, Cpu, Wand2, Loader2, HeartOff } from 'lucide-react'
import type { AIModel, Provider } from '../_types'
import { supportsThinkingParam, hasV4AdvancedParams } from '../_utils'

interface ModelListPanelProps {
  models: AIModel[]
  providers: Provider[]
  resettingHealthId: string | null
  onAddClick: () => void
  onDiscover: () => void
  onEdit: (model: AIModel) => void
  onDelete: (id: string) => void
  onResetHealth: (id: string) => void
}

export function ModelListPanel({
  models,
  providers,
  resettingHealthId,
  onAddClick,
  onDiscover,
  onEdit,
  onDelete,
  onResetHealth
}: ModelListPanelProps) {
  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary/10">
            <Cpu className="w-4 h-4 text-primary" />
          </div>
          <h2 className="text-lg font-bold text-foreground">AI 模型</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onDiscover}
            className="btn btn-ghost flex items-center gap-2"
            title="从已添加的服务商自动发现模型"
          >
            <Wand2 className="w-4 h-4" />
            自动发现
          </button>
          <button
            onClick={onAddClick}
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            添加模型
          </button>
        </div>
      </div>

      {models.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Cpu className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p>暂无模型</p>
          <p className="text-sm mt-2">
            {providers.length === 0 ? '请先添加 AI 服务商' : '点击「自动发现」从服务商拉取模型，或点击「添加模型」手动添加'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {models.map(model => (
            <div key={model.id} className="p-4 rounded-lg bg-muted border border-border">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-foreground">{model.name}</span>
                    {model.name !== model.model && (
                      <code className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-mono">{model.model}</code>
                    )}
                    {model.type === 'thinking' && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">🧠 思考</span>
                    )}
                    {supportsThinkingParam(model) && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300" title="模型支持 thinking 参数注入">🧠 思考参数</span>
                    )}
                    <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">📏 {model.maxTokens} tokens</span>
                    {typeof model.pricePerMillionTokens === 'number' && model.pricePerMillionTokens > 0 && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300" title="每百万 tokens 单价">
                        💰 ¥{model.pricePerMillionTokens}/M
                      </span>
                    )}
                    {hasV4AdvancedParams(model) && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300" title={JSON.stringify(model.params, null, 2)}>⚙️ v4 高级参数</span>
                    )}
                    {/* Phase 6 Task 38.4: 健康状态徽章（仅 degraded / down 显示） */}
                    {model.healthStatus === 'degraded' && (
                      <span
                        className="text-xs px-1.5 py-0.5 rounded bg-warning/20 text-warning"
                        title={model.lastHealthCheckAt ? `最近检查：${new Date(model.lastHealthCheckAt).toLocaleString()}` : '健康度降级'}
                      >
                        ⚠️ 降级
                      </span>
                    )}
                    {model.healthStatus === 'down' && (
                      <span
                        className="text-xs px-1.5 py-0.5 rounded bg-error/20 text-error"
                        title={model.lastHealthCheckAt ? `最近检查：${new Date(model.lastHealthCheckAt).toLocaleString()}` : '健康度异常'}
                      >
                        ⛔ 异常
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                    <span>{model.provider?.name || '未知服务商'}</span>
                    <span>•</span>
                    <span>{model.type === 'generation' ? '生成模型' : '思考模型'}</span>
                    <span>•</span>
                    <span>🌡️ T={model.temperature}</span>
                    {supportsThinkingParam(model) && (
                      <>
                        <span>•</span>
                        <span>🧠 支持 thinking 参数</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Phase 6 Task 38.4: 重置健康度按钮（仅 degraded / down 显示） */}
                  {(model.healthStatus === 'degraded' || model.healthStatus === 'down') && (
                    <button
                      onClick={() => onResetHealth(model.id)}
                      disabled={resettingHealthId === model.id}
                      className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                      title="重置健康度"
                    >
                      {resettingHealthId === model.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <HeartOff className="w-4 h-4" />
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => onEdit(model)}
                    className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDelete(model.id)}
                    className="p-2 rounded-lg hover:bg-error/10 text-muted-foreground hover:text-error transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
