'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import { fetchWithAuth } from '@/lib/api/base'
import {
  Sparkles, Plus, Trash2, Edit, Check, X, Key, Server, 
  Cpu, Save, Loader2, AlertCircle, Eye, EyeOff, Settings
} from 'lucide-react'

interface Provider {
  id: string
  name: string
  slug: string
  baseUrl: string | null
  apiKey: string | null
  isActive: boolean
}

interface AIModel {
  id: string
  name: string
  model: string
  providerId: string
  type: string
  maxTokens: number
  temperature: number
  isActive: boolean
  provider?: {
    name: string
    slug: string
  }
}

export default function AIModelsPage() {
  const router = useRouter()
  const [providers, setProviders] = useState<Provider[]>([])
  const [models, setModels] = useState<AIModel[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  
  const [showProviderForm, setShowProviderForm] = useState(false)
  const [showModelForm, setShowModelForm] = useState(false)
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null)
  const [editingModel, setEditingModel] = useState<AIModel | null>(null)
  const [showApiKey, setShowApiKey] = useState(false)
  
  const [providerForm, setProviderForm] = useState({
    name: '',
    slug: '',
    baseUrl: '',
    apiKey: ''
  })
  
  const [modelForm, setModelForm] = useState({
    name: '',
    model: '',
    providerId: '',
    type: 'generation',
    maxTokens: 4096,
    temperature: 0.7
  })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [providersRes, modelsRes] = await Promise.all([
        fetchWithAuth('/api/admin/ai/providers'),
        fetchWithAuth('/api/admin/ai/models')
      ])
      
      const providersData = await providersRes.json()
      const modelsData = await modelsRes.json()
      
      if (providersData.success) setProviders(providersData.data)
      if (modelsData.success) setModels(modelsData.data)
    } catch (err) {
      setError('加载数据失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveProvider = async () => {
    if (!providerForm.name || !providerForm.slug) {
      setError('请填写服务商名称和标识')
      return
    }

    setSaving(true)
    setError('')

    try {
      const url = editingProvider 
        ? `/api/admin/ai/providers/${editingProvider.id}`
        : '/api/admin/ai/providers'
      
      const method = editingProvider ? 'PUT' : 'POST'
      
      const res = await fetchWithAuth(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(providerForm)
      })

      const data = await res.json()
      if (data.success) {
        setSuccess(editingProvider ? '服务商已更新' : '服务商已创建')
        setShowProviderForm(false)
        setEditingProvider(null)
        setProviderForm({ name: '', slug: '', baseUrl: '', apiKey: '' })
        fetchData()
        setTimeout(() => setSuccess(''), 3000)
      } else {
        setError(data.error || '保存失败')
      }
    } catch (err) {
      setError('网络错误')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveModel = async () => {
    if (!modelForm.name || !modelForm.model || !modelForm.providerId) {
      setError('请填写模型名称、模型ID并选择服务商')
      return
    }

    setSaving(true)
    setError('')

    try {
      const url = editingModel 
        ? `/api/admin/ai/models/${editingModel.id}`
        : '/api/admin/ai/models'
      
      const method = editingModel ? 'PUT' : 'POST'
      
      const res = await fetchWithAuth(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(modelForm)
      })

      const data = await res.json()
      if (data.success) {
        setSuccess(editingModel ? '模型已更新' : '模型已创建')
        setShowModelForm(false)
        setEditingModel(null)
        setModelForm({ name: '', model: '', providerId: '', type: 'generation', maxTokens: 4096, temperature: 0.7 })
        fetchData()
        setTimeout(() => setSuccess(''), 3000)
      } else {
        setError(data.error || '保存失败')
      }
    } catch (err) {
      setError('网络错误')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteProvider = async (id: string) => {
    if (!confirm('确定要删除此服务商吗？相关的模型也将被删除。')) return
    
    try {
      const res = await fetchWithAuth(`/api/admin/ai/providers/${id}`, {
        method: 'DELETE'
      })
      
      const data = await res.json()
      if (data.success) {
        setSuccess('服务商已删除')
        fetchData()
        setTimeout(() => setSuccess(''), 3000)
      } else {
        setError(data.error || '删除失败')
      }
    } catch (err) {
      setError('网络错误')
    }
  }

  const handleDeleteModel = async (id: string) => {
    if (!confirm('确定要删除此模型吗？')) return
    
    try {
      const res = await fetchWithAuth(`/api/admin/ai/models/${id}`, {
        method: 'DELETE'
      })
      
      const data = await res.json()
      if (data.success) {
        setSuccess('模型已删除')
        fetchData()
        setTimeout(() => setSuccess(''), 3000)
      } else {
        setError(data.error || '删除失败')
      }
    } catch (err) {
      setError('网络错误')
    }
  }

  const editProvider = (provider: Provider) => {
    setEditingProvider(provider)
    setProviderForm({
      name: provider.name,
      slug: provider.slug,
      baseUrl: provider.baseUrl || '',
      apiKey: ''
    })
    setShowProviderForm(true)
  }

  const editModel = (model: AIModel) => {
    setEditingModel(model)
    setModelForm({
      name: model.name,
      model: model.model,
      providerId: model.providerId,
      type: model.type,
      maxTokens: model.maxTokens,
      temperature: model.temperature
    })
    setShowModelForm(true)
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-muted-foreground">加载中...</p>
          </div>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)' }}>
              <Cpu className="w-5 h-5 text-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">AI 模型管理</h1>
              <p className="text-sm text-muted-foreground">配置和管理 AI 服务商和模型</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-error/10 border border-red-500/30 text-error px-4 py-3 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        {success && (
          <div className="bg-secondary/10 border border-green-500/30 text-secondary px-4 py-3 rounded-lg flex items-center gap-2">
            <Check className="w-4 h-4" />
            {success}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-info/10">
                  <Server className="w-4 h-4 text-info" />
                </div>
                <h2 className="text-lg font-bold text-foreground">AI 服务商</h2>
              </div>
              <button
                onClick={() => {
                  setEditingProvider(null)
                  setProviderForm({ name: '', slug: '', baseUrl: '', apiKey: '' })
                  setShowProviderForm(true)
                }}
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
                  <div key={provider.id} className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">{provider.name}</span>
                          <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-muted-foreground">{provider.slug}</span>
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
                          onClick={() => editProvider(provider)}
                          className="p-2 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteProvider(provider.id)}
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

          <div className="card p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary/10">
                  <Cpu className="w-4 h-4 text-primary" />
                </div>
                <h2 className="text-lg font-bold text-foreground">AI 模型</h2>
              </div>
              <button
                onClick={() => {
                  if (providers.length === 0) {
                    setError('请先添加 AI 服务商')
                    return
                  }
                  setEditingModel(null)
                  setModelForm({ name: '', model: '', providerId: '', type: 'generation', maxTokens: 4096, temperature: 0.7 })
                  setShowModelForm(true)
                }}
                className="btn btn-primary flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                添加模型
              </button>
            </div>

            {models.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Cpu className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p>暂无模型</p>
                <p className="text-sm mt-2">点击上方按钮添加 AI 模型</p>
              </div>
            ) : (
              <div className="space-y-3">
                {models.map(model => (
                  <div key={model.id} className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">{model.name}</span>
                          <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary">{model.model}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <span>{model.provider?.name || '未知服务商'}</span>
                          <span>•</span>
                          <span>{model.type === 'generation' ? '生成模型' : '思考模型'}</span>
                          <span>•</span>
                          <span>{model.maxTokens} tokens</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => editModel(model)}
                          className="p-2 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteModel(model.id)}
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
        </div>

        {showProviderForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="card p-6 w-full max-w-md">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-foreground">
                  {editingProvider ? '编辑服务商' : '添加服务商'}
                </h3>
                <button
                  onClick={() => setShowProviderForm(false)}
                  className="p-2 rounded-lg hover:bg-white/10 text-muted-foreground"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-2">服务商名称</label>
                  <input
                    type="text"
                    value={providerForm.name}
                    onChange={(e) => setProviderForm({ ...providerForm, name: e.target.value })}
                    placeholder="例如：OpenAI、DeepSeek"
                    className="input"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-2">标识 (slug)</label>
                  <input
                    type="text"
                    value={providerForm.slug}
                    onChange={(e) => setProviderForm({ ...providerForm, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
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
                    onChange={(e) => setProviderForm({ ...providerForm, baseUrl: e.target.value })}
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
                      onChange={(e) => setProviderForm({ ...providerForm, apiKey: e.target.value })}
                      placeholder={editingProvider?.apiKey ? '留空保持不变' : 'sk-...'}
                      className="input pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowProviderForm(false)}
                  className="btn btn-ghost"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveProvider}
                  disabled={saving}
                  className="btn btn-primary flex items-center gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  保存
                </button>
              </div>
            </div>
          </div>
        )}

        {showModelForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="card p-6 w-full max-w-md">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-foreground">
                  {editingModel ? '编辑模型' : '添加模型'}
                </h3>
                <button
                  onClick={() => setShowModelForm(false)}
                  className="p-2 rounded-lg hover:bg-white/10 text-muted-foreground"
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
                    onChange={(e) => setModelForm({ ...modelForm, name: e.target.value })}
                    placeholder="例如：GPT-4、DeepSeek Chat"
                    className="input"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-2">模型 ID</label>
                  <input
                    type="text"
                    value={modelForm.model}
                    onChange={(e) => setModelForm({ ...modelForm, model: e.target.value })}
                    placeholder="例如：gpt-4、deepseek-chat"
                    className="input"
                  />
                  <p className="text-xs text-muted-foreground mt-1">调用 API 时使用的模型标识符</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-2">所属服务商</label>
                  <select
                    value={modelForm.providerId}
                    onChange={(e) => setModelForm({ ...modelForm, providerId: e.target.value })}
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
                    onChange={(e) => setModelForm({ ...modelForm, type: e.target.value })}
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
                      onChange={(e) => setModelForm({ ...modelForm, maxTokens: parseInt(e.target.value) })}
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
                      onChange={(e) => setModelForm({ ...modelForm, temperature: parseFloat(e.target.value) })}
                      className="input"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowModelForm(false)}
                  className="btn btn-ghost"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveModel}
                  disabled={saving}
                  className="btn btn-primary flex items-center gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  保存
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
