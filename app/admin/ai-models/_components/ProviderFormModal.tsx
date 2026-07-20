import { X, Eye, EyeOff, Save, Loader2, Wand2 } from 'lucide-react'
import type { Provider, ProviderFormState, ProviderPreset } from '../_types'

interface ProviderFormModalProps {
  open: boolean
  editingProvider: Provider | null
  providerForm: ProviderFormState
  setProviderForm: React.Dispatch<React.SetStateAction<ProviderFormState>>
  presets: ProviderPreset[]
  selectedPreset: string
  onPresetChange: (slug: string) => void
  showApiKey: boolean
  onToggleShowApiKey: () => void
  saving: boolean
  onSave: () => void
  onSaveAndDiscover: () => void
  onClose: () => void
}

export function ProviderFormModal({
  open,
  editingProvider,
  providerForm,
  setProviderForm,
  presets,
  selectedPreset,
  onPresetChange,
  showApiKey,
  onToggleShowApiKey,
  saving,
  onSave,
  onSaveAndDiscover,
  onClose
}: ProviderFormModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] p-4">
      <div className="card p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-foreground">
            {editingProvider ? '编辑服务商' : '添加服务商'}
          </h3>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {!editingProvider && presets.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">预设（可选）</label>
              <select
                value={selectedPreset}
                onChange={(e) => onPresetChange(e.target.value)}
                className="input"
              >
                <option value="">— 自定义服务商 —</option>
                {presets.map(p => (
                  <option key={p.slug} value={p.slug}>{p.name}（{p.slug}）</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                选预设后自动填充名称 / slug / baseUrl，仍可手动修改
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">服务商名称</label>
            <input
              type="text"
              value={providerForm.name}
              onChange={(e) => setProviderForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="例如：OpenAI、DeepSeek"
              className="input"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">标识 (slug)</label>
            <input
              type="text"
              value={providerForm.slug}
              onChange={(e) => setProviderForm(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
              placeholder="例如：openai、deepseek"
              className="input"
              disabled={!!editingProvider}
            />
            <p className="text-xs text-muted-foreground mt-1">唯一标识，只能包含小写字母、数字和连字符</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">API Base URL (可选)</label>
            <input
              type="text"
              value={providerForm.baseUrl}
              onChange={(e) => setProviderForm(prev => ({ ...prev, baseUrl: e.target.value }))}
              placeholder="https://api.openai.com/v1"
              className="input"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">API Key</label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={providerForm.apiKey}
                onChange={(e) => setProviderForm(prev => ({ ...prev, apiKey: e.target.value }))}
                placeholder={editingProvider?.apiKey ? '留空保持不变' : 'sk-...'}
                className="input pr-10"
              />
              <button
                type="button"
                onClick={onToggleShowApiKey}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="btn btn-ghost"
          >
            取消
          </button>
          {editingProvider ? (
            <button
              onClick={onSave}
              disabled={saving}
              className="btn btn-primary flex items-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              保存
            </button>
          ) : (
            <>
              <button
                onClick={onSaveAndDiscover}
                disabled={saving || !providerForm.apiKey}
                className="btn btn-ghost flex items-center gap-2"
                title={!providerForm.apiKey ? '请先填写 API Key' : '保存后自动发现该服务商的模型'}
              >
                <Wand2 className="w-4 h-4" />
                保存并发现
              </button>
              <button
                onClick={onSave}
                disabled={saving}
                className="btn btn-primary flex items-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                保存
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
