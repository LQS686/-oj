'use client'

import { useState, useEffect } from 'react'
import { Check, ChevronsUpDown, Loader2, Cpu, Zap } from 'lucide-react'
import { fetchWithCookie } from '@/lib/api/base'

interface Model {
 id: string
 name: string
 model: string
 type: string // 'generation' | 'thinking'
 providerName: string
 providerSlug?: string
 maxTokens?: number
 temperature?: number
}

interface ModelSelectorProps {
 value?: string
 onChange: (value: string) => void
 className?: string
 showThinking?: boolean // Whether to show thinking models
}

export function ModelSelector({ value, onChange, className = '', showThinking = true }: ModelSelectorProps) {
 const [models, setModels] = useState<Model[]>([])
 const [loading, setLoading] = useState(true)
 const [isOpen, setIsOpen] = useState(false)

 useEffect(() => {
 fetchModels()
 }, [])

 const fetchModels = async () => {
 try {
 setLoading(true)
 const res = await fetchWithCookie('/api/ai/models')
 const data = await res.json()
 if (data.success) {
 const allModels = data.data.models as Model[]
 // Filter models if needed
 const filtered = showThinking ? allModels : allModels.filter(m => m.type !== 'thinking')
 setModels(filtered)
 
 // Set default if not provided
 if (!value && data.data.defaultModelId) {
 const defaultModel = filtered.find(m => m.id === data.data.defaultModelId)
 if (defaultModel) {
 onChange(defaultModel.id)
 } else if (filtered.length > 0) {
 onChange(filtered[0].id)
 }
 } else if (!value && filtered.length > 0) {
 onChange(filtered[0].id)
 }
 }
 } catch (error) {
 console.error('Failed to fetch models', error)
 } finally {
 setLoading(false)
 }
 }

 const selectedModel = models.find(m => m.id === value)

 return (
 <div className={`relative ${className}`}>
 <button
 type="button"
 onClick={() => setIsOpen(!isOpen)}
 disabled={loading}
 className="w-full flex items-center justify-between px-3 py-2 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all text-sm"
 >
 {loading ? (
 <span className="flex items-center gap-2 text-gray-500">
 <Loader2 className="w-4 h-4 animate-spin" />
 加载模型中...
 </span>
 ) : selectedModel ? (
 <span className="flex items-center gap-2 text-gray-800">
 {selectedModel.type === 'thinking' ? (
 <Cpu className="w-4 h-4 text-purple-600" />
 ) : (
 <Zap className="w-4 h-4 text-blue-600" />
 )}
 <span className="font-medium">{selectedModel.name}</span>
 <span className="text-xs text-gray-500 ml-1">({selectedModel.providerName})</span>
 </span>
 ) : (
 <span className="text-gray-500">选择 AI 模型...</span>
 )}
 <ChevronsUpDown className="w-4 h-4 text-gray-400" />
 </button>

 {isOpen && !loading && (
 <>
 <div 
 className="fixed inset-0 z-10"
 onClick={() => setIsOpen(false)}
 />
 <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
 {models.length === 0 ? (
 <div className="p-3 text-center text-gray-500 text-sm">无可用模型</div>
 ) : (
 <div className="py-1">
 {models.map(model => (
 <button
 key={model.id}
 type="button"
 onClick={() => {
 onChange(model.id)
 setIsOpen(false)
 }}
 className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${value === model.id ? 'bg-purple-50 text-purple-700' : 'text-gray-700'}`}
 >
 <div className="flex items-center gap-2">
 {model.type === 'thinking' ? (
 <Cpu className="w-4 h-4 text-purple-500" />
 ) : (
 <Zap className="w-4 h-4 text-blue-500" />
 )}
 <div className="flex flex-col items-start">
 <span className="font-medium">
 {model.name}
 {model.type === 'thinking' && <span className="text-xs text-purple-500 ml-1">🧠</span>}
 </span>
 <span className="text-xs text-gray-500">
 {model.providerName} · {model.model}
 {model.maxTokens ? ` · 📏 ${model.maxTokens}` : ''}
 </span>
 </div>
 </div>
 {value === model.id && <Check className="w-4 h-4 text-purple-600" />}
 </button>
 ))}
 </div>
 )}
 </div>
 </>
 )}
 </div>
 )
}
