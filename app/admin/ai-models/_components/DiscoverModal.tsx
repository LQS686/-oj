import { X, AlertCircle, Loader2, Wand2 } from 'lucide-react'
import type { DiscoveredModel } from '../_types'

interface DiscoverModalProps {
  open: boolean
  discoverProviderName: string
  discoverError: string
  discoveredModels: DiscoveredModel[]
  selectedDiscovered: Set<string>
  saving: boolean
  onToggle: (model: string) => void
  onBatchAdd: () => void
  onClose: () => void
}

export function DiscoverModal({
  open,
  discoverProviderName,
  discoverError,
  discoveredModels,
  selectedDiscovered,
  saving,
  onToggle,
  onBatchAdd,
  onClose
}: DiscoverModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <Wand2 className="w-5 h-5 text-primary" />
            <div>
              <h3 className="text-lg font-bold text-foreground">自动发现模型</h3>
              <p className="text-xs text-muted-foreground">{discoverProviderName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {discoverError ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{discoverError}</p>
              <p className="text-sm mt-2">你可关闭抽屉，手动添加模型</p>
            </div>
          ) : discoveredModels.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" />
              <p>正在拉取模型列表…</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground mb-3">
                勾选要添加的模型（已默认勾选前 5 个）：
              </p>
              {discoveredModels.map(m => (
                <label
                  key={m.model}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted ${
                    selectedDiscovered.has(m.model)
                      ? 'border-primary bg-primary/5'
                      : 'border-border'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedDiscovered.has(m.model)}
                    onChange={() => onToggle(m.model)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-foreground">{m.name}</span>
                      <code className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{m.model}</code>
                      {m.type === 'thinking' && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">思考</span>
                      )}
                      {m.supportsThinkingParam && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">支持 v4 thinking</span>
                      )}
                    </div>
                    {m.description && (
                      <p className="text-xs text-muted-foreground mt-1">{m.description}</p>
                    )}
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        {!discoverError && discoveredModels.length > 0 && (
          <div className="p-5 border-t border-border flex justify-between items-center">
            <span className="text-sm text-muted-foreground">
              已选 {selectedDiscovered.size} / {discoveredModels.length}
            </span>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="btn btn-ghost"
              >
                取消
              </button>
              <button
                onClick={onBatchAdd}
                disabled={saving || selectedDiscovered.size === 0}
                className="btn btn-primary flex items-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                批量添加
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
