'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { fetchWithAuth } from '@/lib/api/base'
import { logger } from '@/lib/logger'
import { Trophy, ArrowLeft, Save, X, Search, Plus, AlertCircle } from 'lucide-react'

interface Problem {
 id: string
 problemNumber: string | null
 title: string
 difficulty: string
 visibility: string
 isPublic: boolean
}

export default function CreateContestPage() {
 const router = useRouter()
 const [loading, setLoading] = useState(false)
 const [error, setError] = useState('')
 const [formData, setFormData] = useState({
 title: '',
 description: '',
 type: 'OI',
 startTime: '',
 endTime: '',
 isPublic: false,
 password: ''
 })

 const [allProblems, setAllProblems] = useState<Problem[]>([])
 const [contestProblems, setContestProblems] = useState<Problem[]>([])
 const [searchQuery, setSearchQuery] = useState('')
 const [searchResults, setSearchResults] = useState<Problem[]>([])
 const [searching] = useState(false)
 const [batchInput, setBatchInput] = useState('')

 useEffect(() => {
 const fetchProblems = async () => {
 try {
 const response = await fetchWithAuth('/api/admin/problems')
 const data = await response.json()
 if (data.success) {
   const payload = data.data
   setAllProblems(Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [])
 } else {
 setAllProblems([])
 }
 } catch (err) {
 logger.error('加载题目列表失败', err)
 }
 }
 fetchProblems()
 }, [])

 const searchProblems = (query: string) => {
 setSearchQuery(query)
 if (!query) {
 setSearchResults([])
 return
 }
 
 const lowerQuery = query.toLowerCase()
 const filtered = allProblems.filter((p: Problem) => 
 (p.title.toLowerCase().includes(lowerQuery) || 
 (p.problemNumber && p.problemNumber.toLowerCase().includes(lowerQuery))) &&
 !contestProblems.find(cp => cp.id === p.id)
 )
 setSearchResults(filtered.slice(0, 10))
 }

 const handleAddProblem = (problem: Problem) => {
 setContestProblems([...contestProblems, problem])
 setSearchResults([])
 setSearchQuery('')
 }

 const handleRemoveProblem = (problemId: string) => {
 setContestProblems(contestProblems.filter(p => p.id !== problemId))
 }

 const handleBatchAdd = () => {
 if (!batchInput.trim()) return
 
 const numbers = batchInput.split(/[,，\s\n]+/).filter(s => s.trim())
 const problemsToAdd: Problem[] = []
 const notFound: string[] = []
 
 numbers.forEach(num => {
 const targetNum = num.toUpperCase().startsWith('P') ? num.toUpperCase() : `P${num}`
 
 const problem = allProblems.find((p: Problem) => 
 p.problemNumber && p.problemNumber.toUpperCase() === targetNum
 )
 
 if (problem) {
 if (!contestProblems.find(cp => cp.id === problem.id) && !problemsToAdd.find(p => p.id === problem.id)) {
 problemsToAdd.push(problem)
 }
 } else {
 notFound.push(num)
 }
 })
 
 setContestProblems([...contestProblems, ...problemsToAdd])
 setBatchInput('')
 
 if (notFound.length > 0) {
 alert(`以下题目未找到: ${notFound.join(', ')}`)
 }
 }

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault()
 setLoading(true)
 setError('')

 try {
 const response = await fetchWithAuth('/api/admin/contests', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 ...formData,
 problems: contestProblems.map(p => p.id)
 })
 })

 const data = await response.json()
 if (data.success) {
 router.push('/admin/contests')
 } else {
 setError(data.error || '创建失败')
 }
 } catch {
 setError('网络错误')
 } finally {
 setLoading(false)
 }
 }

 return (
 <div className="max-w-4xl mx-auto space-y-6">
 <div className="flex items-center gap-4">
 <button
 onClick={() => router.back()}
 className="p-2 hover:bg-muted rounded-lg transition-colors"
 >
 <ArrowLeft className="w-5 h-5 text-muted-foreground" />
 </button>
 <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
 <Trophy className="w-6 h-6 text-primary-light" />
 创建竞赛
 </h1>
 </div>

 <form onSubmit={handleSubmit} className="space-y-6">
 <div className="card-static rounded-lg p-6 space-y-6">
 {error && (
 <div className="bg-error/10 text-error p-4 rounded-xl text-sm flex items-center gap-2 border border-error/20">
 <AlertCircle className="w-4 h-4" />
 {error}
 </div>
 )}

 <div className="space-y-4">
 <div>
 <label className="block text-sm font-medium text-foreground mb-2">
 竞赛名称 <span className="text-error">*</span>
 </label>
 <input
 type="text"
 required
 value={formData.title}
 onChange={(e) => setFormData({ ...formData, title: e.target.value })}
 className="input"
 placeholder="例如：2024年春季校赛"
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-foreground mb-2">
 竞赛描述 <span className="text-error">*</span>
 </label>
 <textarea
 required
 value={formData.description}
 onChange={(e) => setFormData({ ...formData, description: e.target.value })}
 rows={4}
 className="input"
 placeholder="支持 Markdown 格式..."
 />
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
 <div>
 <label className="block text-sm font-medium text-foreground mb-2">
 赛制类型
 </label>
 <select
 value={formData.type}
 onChange={(e) => setFormData({ ...formData, type: e.target.value })}
 className="input"
 >
 <option value="ACM">ACM (ICPC) - 罚时制</option>
 <option value="OI">OI (NOI) - 得分制</option>
 </select>
 </div>

 <div>
 <label className="block text-sm font-medium text-foreground mb-2">
 可见性
 </label>
 <div className="flex items-center gap-4 mt-3">
 <label className="flex items-center gap-2 cursor-pointer">
 <input
 type="checkbox"
 checked={formData.isPublic}
 onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
 className="w-4 h-4 text-primary rounded focus:ring-primary"
 />
 <span className="text-foreground">公开竞赛</span>
 </label>
 </div>
 </div>

 <div>
 <label className="block text-sm font-medium text-foreground mb-2">
 开始时间 <span className="text-error">*</span>
 </label>
 <input
 type="datetime-local"
 required
 value={formData.startTime}
 onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
 className="input"
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-foreground mb-2">
 结束时间 <span className="text-error">*</span>
 </label>
 <input
 type="datetime-local"
 required
 value={formData.endTime}
 onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
 className="input"
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-foreground mb-2">
 访问密码 (可选)
 </label>
 <input
 type="text"
 value={formData.password}
 onChange={(e) => setFormData({ ...formData, password: e.target.value })}
 className="input"
 placeholder="留空则无需密码"
 />
 </div>
 </div>
 </div>
 </div>

 <div className="card-static rounded-lg p-6 space-y-6">
 <div className="flex justify-between items-center border-b border-border pb-4">
 <h2 className="text-lg font-bold text-foreground">题目管理</h2>
 <span className="tag">已添加 {contestProblems.length} 个</span>
 </div>
 
 <div className="space-y-6">
 <div className="card-static rounded-xl p-4 border border-primary/20">
 <label className="block text-sm font-bold text-primary-light mb-3">
 批量添加题目
 </label>
 <div className="flex gap-3">
 <input
 type="text"
 placeholder="输入题号，例如: P1001, 1002, P1005 (支持逗号或空格分隔)"
 value={batchInput}
 onChange={(e) => setBatchInput(e.target.value)}
 className="input flex-1"
 onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleBatchAdd())}
 />
 <button
 type="button"
 onClick={handleBatchAdd}
 disabled={searching || !batchInput.trim()}
 className="btn btn-primary"
 >
 <Plus className="w-4 h-4" />
 {searching ? '处理中...' : '批量添加'}
 </button>
 </div>
 <p className="text-xs text-muted-foreground mt-3">
 提示：直接输入数字（如 1001）将自动识别为 P1001。支持一次性添加多个题目。
 </p>
 </div>

 <div className="relative">
 <label className="block text-sm font-medium text-foreground mb-2">
 搜索添加题目
 </label>
 <div className="relative">
 <input
 type="text"
 placeholder="搜索题目名称或题号..."
 value={searchQuery}
 onChange={(e) => searchProblems(e.target.value)}
 className="input pl-10"
 />
 <Search className="w-5 h-5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
 </div>
 
 {searchResults.length > 0 && (
 <div className="absolute top-full left-0 right-0 mt-2 card-static rounded-xl shadow-xl z-20 max-h-60 overflow-y-auto">
 {searchResults.map(problem => (
 <button
 key={problem.id}
 type="button"
 onClick={() => handleAddProblem(problem)}
 className="w-full px-4 py-3 text-left hover:bg-muted flex justify-between items-center border-b border-border last:border-0 transition-colors"
 >
 <div className="flex items-center gap-3">
 <span className="tag font-mono">
 {problem.problemNumber}
 </span>
 <span className="font-medium text-foreground">{problem.title}</span>
 <span className={`tag ${
 (problem.visibility === 'contest') ? 'tag-warning' :
 (problem.visibility === 'public' || problem.isPublic) ? 'tag-success' : ''
 }`}>
 {problem.visibility === 'contest' ? '竞赛专用' : 
 (problem.visibility === 'public' || problem.isPublic) ? '公开' : '隐藏'}
 </span>
 </div>
 <span className={`tag ${
 problem.difficulty === '入门' ? 'tag-success' :
 problem.difficulty.includes('普及') ? 'tag-warning' :
 'tag-error'
 }`}>
 {problem.difficulty}
 </span>
 </button>
 ))}
 </div>
 )}
 </div>

 <div className="space-y-2">
 {contestProblems.map((problem, index) => (
 <div key={problem.id} className="flex items-center justify-between p-4 card-static rounded-xl border border-border group hover:border-primary/30 transition-colors">
 <div className="flex items-center gap-4">
 <span className="w-8 h-8 flex items-center justify-center bg-primary/10 border border-primary/20 rounded-full text-sm font-bold text-primary-light">
 {String.fromCharCode(65 + index)}
 </span>
 <div className="flex flex-col">
 <div className="flex items-center gap-2">
 <span className="font-mono text-sm text-muted-foreground">{problem.problemNumber}</span>
 <span className="font-medium text-foreground">{problem.title}</span>
 </div>
 <div className="flex gap-2 mt-1">
 <span className={`tag text-xs ${
 (problem.visibility === 'contest') ? 'tag-warning' :
 (problem.visibility === 'public' || problem.isPublic) ? 'tag-success' : ''
 }`}>
 {problem.visibility === 'contest' ? '竞赛' : 
 (problem.visibility === 'public' || problem.isPublic) ? '公开' : '隐藏'}
 </span>
 <span className="text-xs text-muted-foreground">{problem.difficulty}</span>
 </div>
 </div>
 </div>
 <button
 type="button"
 onClick={() => handleRemoveProblem(problem.id)}
 className="p-2 text-muted-foreground hover:text-error hover:bg-error/10 rounded-lg transition-colors"
 title="移除题目"
 >
 <X className="w-5 h-5" />
 </button>
 </div>
 ))}
 
 {contestProblems.length === 0 && (
 <div className="text-center py-12 card-static rounded-xl border-2 border-dashed border-border text-muted-foreground">
 <p>暂无题目</p>
 <p className="text-sm mt-1">请使用上方工具添加题目到竞赛</p>
 </div>
 )}
 </div>
 </div>
 </div>

 <div className="flex justify-end pt-4">
 <button
 type="submit"
 disabled={loading}
 className="btn btn-primary px-8 py-3"
 >
 <Save className="w-5 h-5" />
 {loading ? '创建中...' : '创建竞赛'}
 </button>
 </div>
 </form>
 </div>
 )
}
