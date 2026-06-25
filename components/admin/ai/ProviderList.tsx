'use client'

import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, Key, Globe, Loader2, Check, X } from 'lucide-react'

interface Provider {
 id: string
 name: string
 slug: string
 baseUrl: string | null
 apiKey: string | null // Masked or null
 isActive: boolean
}

export function ProviderList() {
 const [providers, setProviders] = useState<Provider[]>([])
 const [loading, setLoading] = useState(true)
 const [editing, setEditing] = useState<Provider | null>(null)
 const [isCreating, setIsCreating] = useState(false)
 const [form, setForm] = useState({ name: '', slug: '', baseUrl: '', apiKey: '' })
 const [saving, setSaving] = useState(false)

 useEffect(() => {
 fetchProviders()
 }, [])

 const fetchProviders = async () => {
 setLoading(true)
 try {
 const res = await fetch('/api/admin/ai/providers')
 const data = await res.json()
 if (data.success) {
 setProviders(data.data)
 }
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
 const url = editing ? `/api/admin/ai/providers/${editing.id}` : '/api/admin/ai/providers'
 const method = editing ? 'PUT' : 'POST'
 
 const res = await fetch(url, {
 method,
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(form)
 })
 const data = await res.json()
 if (data.success) {
 fetchProviders()
 setEditing(null)
 setIsCreating(false)
 setForm({ name: '', slug: '', baseUrl: '', apiKey: '' })
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
 if (!confirm('确定要删除此提供商吗？关联的模型可能无法使用。')) return
 try {
 const res = await fetch(`/api/admin/ai/providers/${id}`, { method: 'DELETE' })
 const data = await res.json()
 if (data.success) {
 fetchProviders()
 } else {
 alert(data.error)
 }
 } catch (e) {
 alert('Delete failed')
 }
 }

 const startEdit = (p: Provider) => {
 setEditing(p)
 setForm({
 name: p.name,
 slug: p.slug,
 baseUrl: p.baseUrl || '',
 apiKey: '' // Don't fill apiKey for security, let user enter new one if needed
 })
 setIsCreating(false)
 }

 return (
 <div className="space-y-6">
 <div className="flex justify-between items-center">
 <h3 className="text-lg font-bold">模型提供商</h3>
 <button 
 onClick={() => { setIsCreating(true); setEditing(null); setForm({ name: '', slug: '', baseUrl: '', apiKey: '' }) }}
 className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm flex items-center gap-1 hover:bg-purple-700"
 >
 <Plus className="w-4 h-4" /> 添加提供商
 </button>
 </div>

 {(isCreating || editing) && (
 <form onSubmit={handleSubmit} className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-4">
 <div className="grid grid-cols-2 gap-4">
 <div>
 <label className="block text-sm font-medium mb-1">名称</label>
 <input 
 className="w-full p-2 border rounded" 
 value={form.name} 
 onChange={e => setForm({...form, name: e.target.value})}
 required
 />
 </div>
 <div>
 <label className="block text-sm font-medium mb-1">标识 (Slug)</label>
 <input 
 className="w-full p-2 border rounded" 
 value={form.slug} 
 onChange={e => setForm({...form, slug: e.target.value})}
 disabled={!!editing}
 required
 placeholder="e.g. openai"
 />
 </div>
 </div>
 <div>
 <label className="block text-sm font-medium mb-1">Base URL (可选)</label>
 <input 
 className="w-full p-2 border rounded" 
 value={form.baseUrl} 
 onChange={e => setForm({...form, baseUrl: e.target.value})}
 placeholder="https://api.example.com/v1"
 />
 </div>
 <div>
 <label className="block text-sm font-medium mb-1">API Key {editing && '(留空保持不变)'}</label>
 <input 
 className="w-full p-2 border rounded" 
 value={form.apiKey} 
 onChange={e => setForm({...form, apiKey: e.target.value})}
 type="password"
 placeholder="sk-..."
 />
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
 {providers.map(p => (
 <div key={p.id} className="flex items-center justify-between p-4 bg-white border rounded-lg shadow-sm">
 <div className="flex items-center gap-3">
 <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
 <Globe className="w-5 h-5" />
 </div>
 <div>
 <div className="font-bold">{p.name}</div>
 <div className="text-xs text-gray-500 font-mono">{p.slug}</div>
 </div>
 </div>
 <div className="flex items-center gap-4">
 <div className="text-sm text-gray-500">
 {p.baseUrl ? p.baseUrl : '默认 URL'}
 </div>
 <div className="flex items-center gap-2">
 <button onClick={() => startEdit(p)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded">
 <Edit2 className="w-4 h-4" />
 </button>
 <button onClick={() => handleDelete(p.id)} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded">
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
