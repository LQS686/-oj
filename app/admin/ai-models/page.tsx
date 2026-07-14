'use client'

import { useState, useEffect } from 'react'
import AdminLayout from '@/components/AdminLayout'
import { fetchWithAuth, fetchWithCookie } from '@/lib/api/base'
import {
 Plus, Trash2, Edit, Check, X, Key, Server,
 Cpu, Save, Loader2, AlertCircle, Eye, EyeOff, Sparkles, Wand2
} from 'lucide-react'
import { getProviderMeta } from '@/lib/ai/providers'

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
 params?: Record<string, any>
 provider?: {
 name: string
 slug: string
 }
}

interface ProviderPreset {
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

/**
 * 判断某条 model 是否支持 DeepSeek v4 风格的 thinking 参数
 * 通过 provider.slug 查 provider 字典，再匹配 model id
 */
function supportsThinkingParam(model: { model: string; provider?: { slug?: string } }): boolean {
 const slug = model.provider?.slug
 if (!slug) return false
 const meta = getProviderMeta(slug)
 if (!meta) return false
 const matched = meta.defaultModels.find(m => m.model === model.model)
 return matched?.supportsThinkingParam === true
}

/**
 * 判断 params 中是否含 v4 高级参数（thinking / reasoning_effort）
 */
function hasV4AdvancedParams(model: { params?: Record<string, any> }): boolean {
 if (!model.params || typeof model.params !== 'object') return false
 return Boolean(model.params.thinking) || Boolean(model.params.reasoning_effort)
}

interface DiscoveredModel {
 model: string
 name: string
 type: 'generation' | 'thinking'
 supportsThinkingParam?: boolean
 deprecated?: boolean
 description?: string
}

export default function AIModelsPage() {
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
 const [presets, setPresets] = useState<ProviderPreset[]>([])
 const [selectedPreset, setSelectedPreset] = useState<string>('')
 const [discoverModalOpen, setDiscoverModalOpen] = useState(false)
 const [discoveredModels, setDiscoveredModels] = useState<DiscoveredModel[]>([])
 const [discoverProviderId, setDiscoverProviderId] = useState<string>('')
 const [discoverProviderName, setDiscoverProviderName] = useState<string>('')
 const [discoverError, setDiscoverError] = useState<string>('')
 const [selectedDiscovered, setSelectedDiscovered] = useState<Set<string>>(new Set())
 const [showAdvanced, setShowAdvanced] = useState(false)
 const [paramsText, setParamsText] = useState('{}')

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
 fetchPresets()
 }, [])

 const fetchData = async () => {
 try {
 const [providersRes, modelsRes] = await Promise.all([
 fetchWithAuth('/api/admin/ai/providers'),
 fetchWithAuth('/api/admin/ai/models')
 ])

 const providersData = await providersRes.json()
 const modelsData = await modelsRes.json()

 if (providersData.success) {
 const items = Array.isArray(providersData.data?.items)
 ? providersData.data.items
 : Array.isArray(providersData.data)
 ? providersData.data
 : []
 setProviders(items)
 }
 if (modelsData.success) {
 const items = Array.isArray(modelsData.data?.items)
 ? modelsData.data.items
 : Array.isArray(modelsData.data)
 ? modelsData.data
 : []
 setModels(items)
 } else if (!modelsData.success) {
 setError(modelsData.error?.message || '加载模型数据失败')
 }
 } catch {
 setError('加载数据失败')
 } finally {
 setLoading(false)
 }
 }

 const fetchPresets = async () => {
 try {
 const res = await fetchWithCookie('/api/ai/providers-presets')
 const data = await res.json()
 if (data.success) setPresets(data.data)
 } catch {
 // 静默失败 — 预设列表是可选增强功能
 }
 }

 const handlePresetChange = (slug: string) => {
 setSelectedPreset(slug)
 if (!slug) return
 const preset = presets.find(p => p.slug === slug)
 if (!preset) return
 setProviderForm(prev => ({
 ...prev,
 // 名称未填时自动用预设名
 name: prev.name || preset.name,
 // slug 一致
 slug: preset.slug,
 // baseUrl 未填时用 OpenAI 兼容 baseUrl
 baseUrl: prev.baseUrl || preset.baseUrl
 }))
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
 setSelectedPreset('')
 await fetchData()
 setTimeout(() => setSuccess(''), 3000)
 } else {
 setError(data.error || '保存失败')
 }
 } catch {
 setError('网络错误')
 } finally {
 setSaving(false)
 }
 }

 /**
 * 「保存并发现模型」：先保存服务商，再调用 discover-models
 */
 const handleSaveAndDiscover = async () => {
 if (!providerForm.name || !providerForm.slug) {
 setError('请填写服务商名称和标识')
 return
 }
 if (!providerForm.apiKey) {
 setError('请填写 API Key 后再发现模型')
 return
 }

 setSaving(true)
 setError('')

 try {
 // 1. POST 服务商
 const createRes = await fetchWithAuth('/api/admin/ai/providers', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(providerForm)
 })
 const createData = await createRes.json()
 if (!createData.success) {
 setError(createData.error || '保存失败')
 return
 }
 const newProviderId = createData.data.id

 // 2. 关闭表单 + 刷新列表
 setShowProviderForm(false)
 setProviderForm({ name: '', slug: '', baseUrl: '', apiKey: '' })
 setSelectedPreset('')
 await fetchData()
 setSuccess('服务商已创建，正在拉取模型列表…')
 setTimeout(() => setSuccess(''), 3000)

 // 3. 打开发现抽屉
 await openDiscoverModal(newProviderId, createData.data.name)
 } catch {
 setError('网络错误')
 } finally {
 setSaving(false)
 }
 }

 const openDiscoverModal = async (providerId: string, providerName: string) => {
 setDiscoverProviderId(providerId)
 setDiscoverProviderName(providerName)
 setDiscoverError('')
 setDiscoveredModels([])
 setSelectedDiscovered(new Set())
 setDiscoverModalOpen(true)

 try {
 const res = await fetchWithAuth(`/api/admin/ai/providers/${providerId}/discover-models`)
 const data = await res.json()
 if (data.success) {
 const models = Array.isArray(data.data) ? data.data : (Array.isArray(data.data?.items) ? data.data.items : [])
 if (models.length > 0) {
 setDiscoveredModels(models)
 // 默认勾选前 5 个（避免一次性全选导致超量）
 setSelectedDiscovered(new Set(models.slice(0, 5).map((m: DiscoveredModel) => m.model)))
 } else {
 setDiscoverError(data.reason === 'NOT_SUPPORTED'
 ? (data.message || '该服务商未提供模型列表接口')
 : '该服务商未发现任何新模型')
 }
 } else {
 const code = data.error?.code
 if (code === 'INVALID_API_KEY') {
 setDiscoverError('API Key 无效，请检查后重试')
 } else if (code === 'MISSING_API_KEY') {
 setDiscoverError('该服务商未配置 API Key')
 } else if (code === 'MISSING_ENCRYPTION_KEY') {
 setDiscoverError('服务端加密密钥未配置，无法解密 API Key。请联系管理员在 .env 中设置 AI_CONFIG_ENCRYPTION_KEY 后重启服务。')
 } else if (code === 'INTERNAL_ERROR') {
 // 兜底：技术性错误一律转为友好提示，不暴露 stack / 原始 message
 setDiscoverError('发现模型失败：服务端内部错误，请稍后重试或联系管理员')
 } else {
 setDiscoverError(data.error?.message || '发现模型失败')
 }
 }
 } catch (e) {
 setDiscoverError('网络错误，无法拉取模型列表')
 }
 }

 const toggleDiscovered = (model: string) => {
 setSelectedDiscovered(prev => {
 const next = new Set(prev)
 if (next.has(model)) next.delete(model)
 else next.add(model)
 return next
 })
 }

 const handleBatchAddDiscovered = async () => {
 const toAdd = discoveredModels.filter(m => selectedDiscovered.has(m.model))
 if (toAdd.length === 0) return

 setSaving(true)
 setError('')
 let successCount = 0
 let failCount = 0

 for (const m of toAdd) {
 try {
 const res = await fetchWithAuth('/api/admin/ai/models', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 name: m.name,
 model: m.model,
 providerId: discoverProviderId,
 type: m.type,
 maxTokens: 4096,
 temperature: 0.7
 })
 })
 const data = await res.json()
 if (data.success) successCount++
 else failCount++
 } catch {
 failCount++
 }
 }

 setSaving(false)
 setDiscoverModalOpen(false)
 setSuccess(`已添加 ${successCount} 个模型${failCount > 0 ? `，${failCount} 个失败` : ''}`)
 setTimeout(() => setSuccess(''), 3000)
 await fetchData()
 }

 const handleSaveModel = async () => {
 if (!modelForm.name || !modelForm.model || !modelForm.providerId) {
 setError('请填写模型名称、模型ID并选择服务商')
 return
 }

 // 解析 params JSON
 let parsedParams: Record<string, any> = {}
 if (paramsText && paramsText.trim()) {
 try {
 parsedParams = JSON.parse(paramsText)
 } catch {
 setError('高级参数 JSON 格式错误')
 return
 }
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
 body: JSON.stringify({
 ...modelForm,
 params: parsedParams
 })
 })

 const data = await res.json()
 if (data.success) {
 setSuccess(editingModel ? '模型已更新' : '模型已创建')
 setShowModelForm(false)
 setEditingModel(null)
 setModelForm({ name: '', model: '', providerId: '', type: 'generation', maxTokens: 4096, temperature: 0.7 })
 setParamsText('{}')
 setShowAdvanced(false)
 fetchData()
 setTimeout(() => setSuccess(''), 3000)
 } else {
 setError(data.error || '保存失败')
 }
 } catch {
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
 } catch {
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
 } catch {
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
 setParamsText(JSON.stringify(model.params || {}, null, 2))
 setShowAdvanced(!!model.params && Object.keys(model.params).length > 0)
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

 // 当没有任何服务商时，模型列表也强制为空，避免显示孤儿模型
 const effectiveModels = providers.length === 0 ? [] : models

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
 onClick={() => openDiscoverModal(provider.id, provider.name)}
 disabled={!provider.apiKey}
 className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
 title={!provider.apiKey ? '需先配置 API Key' : '自动发现该服务商的模型'}
 >
 <Wand2 className="w-4 h-4" />
 </button>
 <button
 onClick={() => editProvider(provider)}
 className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
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
 <div className="flex items-center gap-2">
 <button
 onClick={async () => {
 if (providers.length === 0) {
 setError('请先添加 AI 服务商')
 return
 }
 // 让用户选择从哪个服务商发现
 const provider = providers[0]
 await openDiscoverModal(provider.id, provider.name)
 }}
 className="btn btn-ghost flex items-center gap-2"
 title="从已添加的服务商自动发现模型"
 >
 <Wand2 className="w-4 h-4" />
 自动发现
 </button>
 <button
 onClick={() => {
 if (providers.length === 0) {
 setError('请先添加 AI 服务商')
 return
 }
 setEditingModel(null)
 setModelForm({ name: '', model: '', providerId: '', type: 'generation', maxTokens: 4096, temperature: 0.7 })
 setParamsText('{}')
 setShowAdvanced(false)
 setShowModelForm(true)
 }}
 className="btn btn-primary flex items-center gap-2"
 >
 <Plus className="w-4 h-4" />
 添加模型
 </button>
 </div>
 </div>

 {effectiveModels.length === 0 ? (
 <div className="text-center py-8 text-muted-foreground">
 <Cpu className="w-12 h-12 mx-auto mb-4 opacity-30" />
 <p>暂无模型</p>
 <p className="text-sm mt-2">
 {providers.length === 0 ? '请先添加 AI 服务商' : '点击「自动发现」从服务商拉取模型，或点击「添加模型」手动添加'}
 </p>
 </div>
 ) : (
 <div className="space-y-3">
 {effectiveModels.map(model => (
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
 {hasV4AdvancedParams(model) && (
 <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300" title={JSON.stringify(model.params, null, 2)}>⚙️ v4 高级参数</span>
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
 <button
 onClick={() => editModel(model)}
 className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
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
 onChange={(e) => handlePresetChange(e.target.value)}
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
 onClick={() => {
 setShowProviderForm(false)
 setSelectedPreset('')
 }}
 className="btn btn-ghost"
 >
 取消
 </button>
 {editingProvider ? (
 <button
 onClick={handleSaveProvider}
 disabled={saving}
 className="btn btn-primary flex items-center gap-2"
 >
 {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
 保存
 </button>
 ) : (
 <>
 <button
 onClick={handleSaveAndDiscover}
 disabled={saving || !providerForm.apiKey}
 className="btn btn-ghost flex items-center gap-2"
 title={!providerForm.apiKey ? '请先填写 API Key' : '保存后自动发现该服务商的模型'}
 >
 <Wand2 className="w-4 h-4" />
 保存并发现
 </button>
 <button
 onClick={handleSaveProvider}
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
 placeholder="例如：gpt-4、deepseek-v4-flash"
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

 {/* 高级参数折叠区 */}
 <div className="border-t border-border pt-4">
 <button
 type="button"
 onClick={() => setShowAdvanced(s => !s)}
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
 onChange={(e) => setParamsText(e.target.value)}
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

 {/* 自动发现模型抽屉 */}
 {discoverModalOpen && (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
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
 onClick={() => setDiscoverModalOpen(false)}
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
 onChange={() => toggleDiscovered(m.model)}
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
 onClick={() => setDiscoverModalOpen(false)}
 className="btn btn-ghost"
 >
 取消
 </button>
 <button
 onClick={handleBatchAddDiscovered}
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
 )}
 </div>
 </AdminLayout>
 )
}
