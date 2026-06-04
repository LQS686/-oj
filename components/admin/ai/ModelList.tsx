'use client'

import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, Zap, Cpu, Loader2 } from 'lucide-react'

interface Model {
    id: string
    name: string
    model: string
    providerId: string
    provider: { name: string, slug: string }
    type: string
    maxTokens: number
    temperature: number
    timeout: number
    isActive: boolean
}

interface Provider {
    id: string
    name: string
}

export function ModelList() {
    const [models, setModels] = useState<Model[]>([])
    const [providers, setProviders] = useState<Provider[]>([])
    const [loading, setLoading] = useState(true)
    const [editing, setEditing] = useState<Model | null>(null)
    const [isCreating, setIsCreating] = useState(false)
    const [saving, setSaving] = useState(false)
    
    const [form, setForm] = useState({
        name: '',
        model: '',
        providerId: '',
        type: 'generation',
        maxTokens: 2048,
        temperature: 0.7,
        timeout: 60000
    })

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        setLoading(true)
        try {
            const [mRes, pRes] = await Promise.all([
                fetch('/api/admin/ai/models'),
                fetch('/api/admin/ai/providers')
            ])
            const mData = await mRes.json()
            const pData = await pRes.json()
            
            if (mData.success) setModels(mData.data)
            if (pData.success) setProviders(pData.data)
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        try {
            const url = editing ? `/api/admin/ai/models/${editing.id}` : '/api/admin/ai/models'
            const method = editing ? 'PUT' : 'POST'
            
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form)
            })
            const data = await res.json()
            if (data.success) {
                fetchData() // Refresh list
                setEditing(null)
                setIsCreating(false)
                resetForm()
            } else {
                alert(data.error)
            }
        } catch (e) {
            alert('Operation failed')
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm('确定要删除此模型吗？')) return
        try {
            const res = await fetch(`/api/admin/ai/models/${id}`, { method: 'DELETE' })
            const data = await res.json()
            if (data.success) fetchData()
            else alert(data.error)
        } catch (e) {
            alert('Delete failed')
        }
    }

    const resetForm = () => {
        setForm({
            name: '',
            model: '',
            providerId: providers.length > 0 ? providers[0].id : '',
            type: 'generation',
            maxTokens: 2048,
            temperature: 0.7,
            timeout: 60000
        })
    }

    const startEdit = (m: Model) => {
        setEditing(m)
        setForm({
            name: m.name,
            model: m.model,
            providerId: m.providerId,
            type: m.type,
            maxTokens: m.maxTokens,
            temperature: m.temperature,
            timeout: m.timeout
        })
        setIsCreating(false)
    }

    const startCreate = () => {
        setIsCreating(true)
        setEditing(null)
        resetForm()
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold">AI 模型列表</h3>
                <button 
                    onClick={startCreate}
                    className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm flex items-center gap-1 hover:bg-purple-700"
                >
                    <Plus className="w-4 h-4" /> 添加模型
                </button>
            </div>

            {(isCreating || editing) && (
                <form onSubmit={handleSubmit} className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">显示名称</label>
                            <input 
                                className="w-full p-2 border rounded" 
                                value={form.name} 
                                onChange={e => setForm({...form, name: e.target.value})}
                                placeholder="e.g. DeepSeek Chat V3"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">模型 ID (API)</label>
                            <input 
                                className="w-full p-2 border rounded" 
                                value={form.model} 
                                onChange={e => setForm({...form, model: e.target.value})}
                                placeholder="e.g. deepseek-v4-flash"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">提供商</label>
                            <select 
                                className="w-full p-2 border rounded"
                                value={form.providerId}
                                onChange={e => setForm({...form, providerId: e.target.value})}
                                required
                            >
                                <option value="">选择提供商</option>
                                {providers.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">类型</label>
                            <select 
                                className="w-full p-2 border rounded"
                                value={form.type}
                                onChange={e => setForm({...form, type: e.target.value})}
                            >
                                <option value="generation">生成模型 (Generation)</option>
                                <option value="thinking">思考模型 (Thinking)</option>
                            </select>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-2 col-span-2">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Max Tokens</label>
                                <input 
                                    type="number"
                                    className="w-full p-2 border rounded text-sm"
                                    value={form.maxTokens}
                                    onChange={e => setForm({...form, maxTokens: parseInt(e.target.value)})}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Temperature</label>
                                <input 
                                    type="number" step="0.1" max="2" min="0"
                                    className="w-full p-2 border rounded text-sm"
                                    value={form.temperature}
                                    onChange={e => setForm({...form, temperature: parseFloat(e.target.value)})}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Timeout (ms)</label>
                                <input 
                                    type="number" step="1000"
                                    className="w-full p-2 border rounded text-sm"
                                    value={form.timeout}
                                    onChange={e => setForm({...form, timeout: parseInt(e.target.value)})}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2">
                        <button 
                            type="button"
                            onClick={() => { setIsCreating(false); setEditing(null) }}
                            className="px-3 py-1.5 text-gray-600 hover:bg-gray-200 rounded"
                        >
                            取消
                        </button>
                        <button 
                            type="submit"
                            disabled={saving}
                            className="px-3 py-1.5 bg-purple-600 text-white rounded hover:bg-purple-700 flex items-center gap-1"
                        >
                            {saving && <Loader2 className="w-3 h-3 animate-spin" />} 保存
                        </button>
                    </div>
                </form>
            )}

            {loading ? (
                <div className="text-center py-4"><Loader2 className="w-6 h-6 animate-spin mx-auto text-purple-600" /></div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {models.map(m => (
                        <div key={m.id} className="flex items-center justify-between p-4 bg-white border rounded-lg shadow-sm">
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg ${m.type === 'thinking' ? 'bg-purple-50 text-purple-600' : 'bg-green-50 text-green-600'}`}>
                                    {m.type === 'thinking' ? <Cpu className="w-5 h-5" /> : <Zap className="w-5 h-5" />}
                                </div>
                                <div>
                                    <div className="font-bold flex items-center gap-2 flex-wrap">
                                        {m.name}
                                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full font-normal">
                                            {m.provider.name}
                                        </span>
                                    </div>
                                    <div className="text-xs text-gray-500 font-mono">{m.model}</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="text-xs text-gray-400">
                                    {m.maxTokens} tokens / T={m.temperature}
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => startEdit(m)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded">
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => handleDelete(m.id)} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded">
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
