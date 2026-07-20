import { Plus, Trash2, Edit, Key, Server, AlertCircle, Wand2 } from 'lucide-react'
import type { Provider } from '../_types'

interface ProviderListPanelProps {
  providers: Provider[]
  onAddClick: () => void
  onEdit: (provider: Provider) => void
  onDelete: (id: string) => void
  onDiscover: (providerId: string, providerName: string) => void
}

export function ProviderListPanel({
  providers,
  onAddClick,
  onEdit,
  onDelete,
  onDiscover
}: ProviderListPanelProps) {
  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-info/10">
            <Server className="w-4 h-4 text-info" />
          </div>
          <h2 className="text-lg font-bold text-foreground">AI 服务商</h2>
        </div>
        <button
          onClick={onAddClick}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          添加服务商
        </button>
      </div>

      {providers.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Server className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p>暂无服务商</p>
          <p className="text-sm mt-2">点击上方按钮添加 AI 服务商</p>
        </div>
      ) : (
        <div className="space-y-3">
          {providers.map(provider => (
            <div key={provider.id} className="p-4 rounded-lg bg-muted border border-border">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{provider.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">{provider.slug}</span>
                  </div>
                  {provider.baseUrl && (
                    <p className="text-xs text-muted-foreground mt-1">{provider.baseUrl}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    {provider.apiKey ? (
                      <span className="text-xs text-secondary flex items-center gap-1">
                        <Key className="w-3 h-3" /> 已配置 API Key
                      </span>
                    ) : (
                      <span className="text-xs text-accent-light flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> 未配置 API Key
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onDiscover(provider.id, provider.name)}
                    disabled={!provider.apiKey}
                    className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
                    title={!provider.apiKey ? '需先配置 API Key' : '自动发现该服务商的模型'}
                  >
                    <Wand2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onEdit(provider)}
                    className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDelete(provider.id)}
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
