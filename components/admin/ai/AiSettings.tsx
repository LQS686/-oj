'use client'

import { useState } from 'react'
import { ProviderList } from './ProviderList'
import { ModelList } from './ModelList'

export function AiSettings() {
 const [tab, setTab] = useState<'providers' | 'models'>('providers')

 return (
 <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 max-w-4xl">
 <div className="flex items-center justify-between mb-6">
 <h2 className="text-xl font-bold text-gray-800">多模型配置管理</h2>
 <div className="text-sm text-gray-500">
 配置多个 AI 模型供用户选择
 </div>
 </div>

 <div className="flex border-b mb-6">
 <button
 onClick={() => setTab('providers')}
 className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 ${
 tab === 'providers' ? 'border-purple-600 text-purple-600 bg-purple-50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
 }`}
 >
 1. 模型提供商 (Providers)
 </button>
 <button
 onClick={() => setTab('models')}
 className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 ${
 tab === 'models' ? 'border-purple-600 text-purple-600 bg-purple-50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
 }`}
 >
 2. 模型列表 (Models)
 </button>
 </div>

 {tab === 'providers' ? <ProviderList /> : <ModelList />}
 </div>
 )
}
