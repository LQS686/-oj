import { X, Save, Loader2 } from 'lucide-react'
import type { AIModel, ModelFormState, Provider } from '../_types'

interface ModelFormModalProps {
  open: boolean
  editingModel: AIModel | null
  modelForm: ModelFormState
  setModelForm: React.Dispatch<React.SetStateAction<ModelFormState>>
  providers: Provider[]
  showAdvanced: boolean
  onToggleAdvanced: () => void
  paramsText: string
  onParamsTextChange: (text: string) => void
  saving: boolean
  onSave: () => void
  onClose: () => void
}

export function ModelFormModal({
  open,
  editingModel,
  modelForm,
  setModelForm,
  providers,
  showAdvanced,
  onToggleAdvanced,
  paramsText,
  onParamsTextChange,
  saving,
  onSave,
  onClose
}: ModelFormModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] p-4">
      <div className="card p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-foreground">
            {editingModel ? '编辑模型' : '添加模型'}
          </h3>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">模型名称</label>
            <input
              type="text"
              value={modelForm.name}
              onChange={(e) => setModelForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="例如：GPT-4、DeepSeek Chat"
              className="input"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">模型 ID</label>
            <input
              type="text"
              value={modelForm.model}
              onChange={(e) => setModelForm(prev => ({ ...prev, model: e.target.value }))}
              placeholder="例如：gpt-4、deepseek-v4-flash"
              className="input"
            />
            <p className="text-xs text-muted-foreground mt-1">调用 API 时使用的模型标识符</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">所属服务商</label>
            <select
              value={modelForm.providerId}
              onChange={(e) => setModelForm(prev => ({ ...prev, providerId: e.target.value }))}
              className="input"
            >
              <option value="">选择服务商</option>
              {providers.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">模型类型</label>
            <select
              value={modelForm.type}
              onChange={(e) => setModelForm(prev => ({ ...prev, type: e.target.value }))}
              className="input"
            >
              <option value="generation">生成模型</option>
              <option value="thinking">思考模型</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">最大 Tokens</label>
              <input
                type="number"
                value={modelForm.maxTokens}
                onChange={(e) => setModelForm(prev => ({ ...prev, maxTokens: parseInt(e.target.value) }))}
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">温度</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="2"
                value={modelForm.temperature}
                onChange={(e) => setModelForm(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                className="input"
              />
            </div>
          </div>

          {/* Task 35.5: 每百万 tokens 单价（用于成本估算） */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              单价（元 / 百万 tokens）
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={modelForm.pricePerMillionTokens ?? ''}
              onChange={(e) => {
                const v = e.target.value
                setModelForm(prev => ({ ...prev, pricePerMillionTokens: v === '' ? null : parseFloat(v) }))
              }}
              placeholder="留空表示未配置"
              className="input"
            />
            <p className="text-xs text-muted-foreground mt-1">
              用于在监控页 / 仪表盘估算 AI 任务成本。留空则不计入成本统计。
            </p>
          </div>

          {/* 高级参数折叠区 */}
          <div className="border-t border-border pt-4">
            <button
              type="button"
              onClick={onToggleAdvanced}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              {showAdvanced ? '▼' : '▶'} 高级参数（JSON）
            </button>
            {showAdvanced && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  透传到 OpenAI chat.completions.create 的额外参数。DeepSeek v4 模型支持 <code className="bg-muted px-1 rounded">{'{ "thinking": { "type": "enabled" }, "reasoning_effort": "high" }'}</code> 启用思考模式。
                </p>
                <textarea
                  value={paramsText}
                  onChange={(e) => onParamsTextChange(e.target.value)}
                  rows={6}
                  className="input font-mono text-xs"
                  placeholder='{"topP": 0.9, "frequencyPenalty": 0.1}'
                />
                <p className="text-xs text-muted-foreground">
                  常见键：topP / frequencyPenalty / presencePenalty / responseFormat / stop / thinking / reasoning_effort
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="btn btn-ghost"
          >
            取消
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="btn btn-primary flex items-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
