'use client'

import { useState, useEffect } from 'react'
import { fetchWithCookie } from '@/lib/api/base'
import { Check, AlertCircle } from 'lucide-react'
import type {
  Provider,
  AIModel,
  ProviderPreset,
  DiscoveredModel,
  ProviderFormState,
  ModelFormState
} from './_types'
import { ProviderListPanel } from './_components/ProviderListPanel'
import { ModelListPanel } from './_components/ModelListPanel'
import { ProviderFormModal } from './_components/ProviderFormModal'
import { ModelFormModal } from './_components/ModelFormModal'
import { DiscoverModal } from './_components/DiscoverModal'
import { AiDisabledNotice } from '@/components/ai/AiDisabledNotice'
import { AI_FEATURE_DISABLED } from '@/lib/ai/feature-flag'

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
  // Phase 6 Task 38.4: 重置健康度 loading 状态
  const [resettingHealthId, setResettingHealthId] = useState<string | null>(null)

  const [providerForm, setProviderForm] = useState<ProviderFormState>({
    name: '',
    slug: '',
    baseUrl: '',
    apiKey: ''
  })

  const [modelForm, setModelForm] = useState<ModelFormState>({
    name: '',
    model: '',
    providerId: '',
    type: 'generation',
    maxTokens: 4096,
    temperature: 0.7,
    pricePerMillionTokens: null
  })

  useEffect(() => {
    fetchData()
    fetchPresets()
  }, [])

  const fetchData = async () => {
    try {
      const [providersRes, modelsRes] = await Promise.all([
        fetchWithCookie('/api/admin/ai/providers'),
        fetchWithCookie('/api/admin/ai/models')
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

      const res = await fetchWithCookie(url, {
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
      const createRes = await fetchWithCookie('/api/admin/ai/providers', {
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
      const res = await fetchWithCookie(`/api/admin/ai/providers/${providerId}/discover-models`)
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
    } catch {
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
        const res = await fetchWithCookie('/api/admin/ai/models', {
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

      const res = await fetchWithCookie(url, {
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
        setModelForm({ name: '', model: '', providerId: '', type: 'generation', maxTokens: 4096, temperature: 0.7, pricePerMillionTokens: null })
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
      const res = await fetchWithCookie(`/api/admin/ai/providers/${id}`, {
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
      const res = await fetchWithCookie(`/api/admin/ai/models/${id}`, {
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

  /**
   * Phase 6 Task 38.4: 重置模型健康度
   *
   * 调 POST /api/admin/ai/models/[id]/reset-health
   * 清空 healthStatus（变回 healthy）+ 更新 lastHealthCheckAt = now()
   */
  const handleResetHealth = async (id: string) => {
    setResettingHealthId(id)
    setError('')
    try {
      const res = await fetchWithCookie(`/api/admin/ai/models/${id}/reset-health`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (data.success) {
        setSuccess('模型健康度已重置')
        fetchData()
        setTimeout(() => setSuccess(''), 3000)
      } else {
        setError(data.error || '重置失败')
      }
    } catch {
      setError('网络错误')
    } finally {
      setResettingHealthId(null)
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
      temperature: model.temperature,
      pricePerMillionTokens: model.pricePerMillionTokens ?? null
    })
    setParamsText(JSON.stringify(model.params || {}, null, 2))
    setShowAdvanced(!!model.params && Object.keys(model.params).length > 0)
    setShowModelForm(true)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    )
  }

  // 当没有任何服务商时，模型列表也强制为空，避免显示孤儿模型
  const effectiveModels = providers.length === 0 ? [] : models

  // AI 功能下架：在所有 hooks 调用之后判定（遵守 React Rules of Hooks）
  if (AI_FEATURE_DISABLED) {
    return <AiDisabledNotice />
  }

  return (
    <div className="space-y-6">
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
        <ProviderListPanel
          providers={providers}
          onAddClick={() => {
            setEditingProvider(null)
            setProviderForm({ name: '', slug: '', baseUrl: '', apiKey: '' })
            setSelectedPreset('')
            setShowProviderForm(true)
          }}
          onEdit={editProvider}
          onDelete={handleDeleteProvider}
          onDiscover={openDiscoverModal}
        />

        <ModelListPanel
          models={effectiveModels}
          providers={providers}
          resettingHealthId={resettingHealthId}
          onAddClick={() => {
            if (providers.length === 0) {
              setError('请先添加 AI 服务商')
              return
            }
            setEditingModel(null)
            setModelForm({ name: '', model: '', providerId: '', type: 'generation', maxTokens: 4096, temperature: 0.7, pricePerMillionTokens: null })
            setParamsText('{}')
            setShowAdvanced(false)
            setShowModelForm(true)
          }}
          onDiscover={async () => {
            if (providers.length === 0) {
              setError('请先添加 AI 服务商')
              return
            }
            // 让用户选择从哪个服务商发现
            const provider = providers[0]
            await openDiscoverModal(provider.id, provider.name)
          }}
          onEdit={editModel}
          onDelete={handleDeleteModel}
          onResetHealth={handleResetHealth}
        />
      </div>

      <ProviderFormModal
        open={showProviderForm}
        editingProvider={editingProvider}
        providerForm={providerForm}
        setProviderForm={setProviderForm}
        presets={presets}
        selectedPreset={selectedPreset}
        onPresetChange={handlePresetChange}
        showApiKey={showApiKey}
        onToggleShowApiKey={() => setShowApiKey(!showApiKey)}
        saving={saving}
        onSave={handleSaveProvider}
        onSaveAndDiscover={handleSaveAndDiscover}
        onClose={() => {
          setShowProviderForm(false)
          setSelectedPreset('')
        }}
      />

      <ModelFormModal
        open={showModelForm}
        editingModel={editingModel}
        modelForm={modelForm}
        setModelForm={setModelForm}
        providers={providers}
        showAdvanced={showAdvanced}
        onToggleAdvanced={() => setShowAdvanced(s => !s)}
        paramsText={paramsText}
        onParamsTextChange={setParamsText}
        saving={saving}
        onSave={handleSaveModel}
        onClose={() => setShowModelForm(false)}
      />

      <DiscoverModal
        open={discoverModalOpen}
        discoverProviderName={discoverProviderName}
        discoverError={discoverError}
        discoveredModels={discoveredModels}
        selectedDiscovered={selectedDiscovered}
        saving={saving}
        onToggle={toggleDiscovered}
        onBatchAdd={handleBatchAddDiscovered}
        onClose={() => setDiscoverModalOpen(false)}
      />
    </div>
  )
}
