'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Search, Plus, Trash2, Save, AlertCircle } from 'lucide-react'
import { useUser } from '@/contexts/UserContext'
import toast from 'react-hot-toast'
import { canCreateContest } from '@/lib/permissions'
import { fetchWithAuth } from '@/lib/api/base'

interface Problem {
 id: string
 problemNumber: string
 title: string
 difficulty: string
}

export default function CreateContestPage() {
 const router = useRouter()
 const { user } = useUser()
 const [loading, setLoading] = useState(false)
 const [error, setError] = useState('')
 
 useEffect(() => {
 if (!user) {
 router.push('/login?redirect=/contests/create')
 return
 }
 
 if (!canCreateContest(user)) {
 toast.error('权限不足：只有教师和管理员可以创建竞赛')
 router.push('/contests')
 return
 }
 }, [user, router])
 
 // Form State
 const [title, setTitle] = useState('')
 const [description, setDescription] = useState('')
 const [type, setType] = useState('OI')
 const [startTime, setStartTime] = useState('')
 const [endTime, setEndTime] = useState('')
 const [isPublic, setIsPublic] = useState(true)
 const [password, setPassword] = useState('')

 // Problem Management State
 const [contestProblems, setContestProblems] = useState<Problem[]>([])
 const [searchQuery, setSearchQuery] = useState('')
 const [searchResults, setSearchResults] = useState<Problem[]>([])
 const [searching, setSearching] = useState(false)
 const [batchInput, setBatchInput] = useState('')

 const searchProblems = async (query: string) => {
 if (!query) {
 setSearchResults([])
 return
 }
 setSearching(true)
 try {
 const response = await fetch(`/api/problems?search=${encodeURIComponent(query)}&limit=5`)
 const data = await response.json()
 if (data.success) {
 // Filter out already added problems
 const filtered = (data.data.problems || []).filter((p: Problem) =>
 !contestProblems.find(cp => cp.id === p.id)
 )
 setSearchResults(filtered)
 }
 } catch (err) {
 console.error(err)
 } finally {
 setSearching(false)
 }
 }

 const handleAddProblem = (problem: Problem) => {
 setContestProblems([...contestProblems, problem])
 setSearchResults([])
 setSearchQuery('')
 }

 const handleRemoveProblem = (problemId: string) => {
 setContestProblems(contestProblems.filter(p => p.id !== problemId))
 }

 const handleBatchAdd = async () => {
 if (!batchInput.trim()) return
 
 setSearching(true)
 try {
 // Parse inputs: "P1001, 1002" -> ["P1001", "P1002"]
 const numbers = batchInput.split(/[,，\s\n]+/)
 .filter(s => s.trim())
 .map(s => s.trim().toUpperCase().startsWith('P') ? s.trim().toUpperCase() : `P${s.trim()}`)
 
 if (numbers.length === 0) return

 const response = await fetch(`/api/problems?numbers=${encodeURIComponent(numbers.join(','))}`)
 const data = await response.json()
 
 if (data.success) {
 const foundProblems = (data.data.problems || []) as Problem[]
 const newProblems: Problem[] = []
 const foundNumbers = new Set(foundProblems.map(p => p.problemNumber))
 const notFound: string[] = []
 
 // Check which were found
 numbers.forEach(num => {
 if (!foundNumbers.has(num)) {
 notFound.push(num)
 }
 })

 // Add found problems if not already in list
 foundProblems.forEach(p => {
 if (!contestProblems.find(cp => cp.id === p.id)) {
 newProblems.push(p)
 }
 })
 
 setContestProblems([...contestProblems, ...newProblems])
 setBatchInput('')
 
 if (notFound.length > 0) {
 alert(`以下题目未找到或未公开: ${notFound.join(', ')}`)
 }
 }
 } catch (err) {
 console.error(err)
 alert('批量添加失败：网络错误')
 } finally {
 setSearching(false)
 }
 }

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault()
 setLoading(true)
 setError('')

 try {
 if (new Date(endTime) <= new Date(startTime)) {
 throw new Error('结束时间必须晚于开始时间')
 }

 const duration = Math.floor((new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000)

 const response = await fetchWithAuth('/api/contests', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({
 title,
 description,
 type,
 startTime,
 endTime,
 duration,
 isPublic,
 password: isPublic ? undefined : password,
 problemIds: contestProblems.map(p => p.id)
 })
 })

 const data = await response.json()
 if (data.success) {
 router.push('/contests')
 } else {
 setError(data.error || '创建失败')
 }
 } catch (err: any) {
 setError(err.message || '网络错误')
 } finally {
 setLoading(false)
 }
 }

 return (
 <div className="min-h-screen bg-background py-8">
 <div className="container mx-auto px-4 max-w-4xl">
 <button
 onClick={() => router.back()}
 className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors"
 >
 <ArrowLeft className="w-5 h-5" />
 <span>返回列表</span>
 </button>

 <form onSubmit={handleSubmit} className="space-y-6">
 <div className="card p-8 space-y-6">
 <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
 <Plus className="w-6 h-6 text-primary-light" />
 创建新竞赛
 </h1>

 {error && (
 <div className="bg-error/10 text-error p-4 rounded-lg text-sm flex items-center gap-2 border border-error/20">
 <AlertCircle className="w-4 h-4" />
 {error}
 </div>
 )}

 <div className="space-y-4">
 <div>
 <label className="block text-sm font-medium text-muted-foreground mb-1">
 竞赛名称 <span className="text-error">*</span>
 </label>
 <input
 type="text"
 required
 value={title}
 onChange={(e) => setTitle(e.target.value)}
 className="input"
 placeholder="例如：2024年春季程序设计竞赛"
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-muted-foreground mb-1">
 竞赛描述
 </label>
 <textarea
 value={description}
 onChange={(e) => setDescription(e.target.value)}
 rows={4}
 className="input min-h-[100px]"
 placeholder="请输入竞赛规则、说明等信息（支持 Markdown）"
 />
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
 <div>
 <label className="block text-sm font-medium text-muted-foreground mb-1">
 赛制类型
 </label>
 <select
 value={type}
 onChange={(e) => setType(e.target.value)}
 className="input"
 >
 <option value="ACM">ACM (ICPC) - 罚时制</option>
 <option value="OI">OI (NOI) - 得分制</option>
 </select>
 </div>

 <div>
 <label className="block text-sm font-medium text-muted-foreground mb-1">
 可见性
 </label>
 <select
 value={isPublic ? 'public' : 'private'}
 onChange={(e) => setIsPublic(e.target.value === 'public')}
 className="input"
 >
 <option value="public">公开 (所有人可见)</option>
 <option value="private">私有 (需要密码)</option>
 </select>
 </div>

 <div>
 <label className="block text-sm font-medium text-muted-foreground mb-1">
 开始时间 <span className="text-error">*</span>
 </label>
 <input
 type="datetime-local"
 required
 value={startTime}
 onChange={(e) => setStartTime(e.target.value)}
 className="input"
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-muted-foreground mb-1">
 结束时间 <span className="text-error">*</span>
 </label>
 <input
 type="datetime-local"
 required
 value={endTime}
 onChange={(e) => setEndTime(e.target.value)}
 className="input"
 />
 </div>
 </div>

 {!isPublic && (
 <div>
 <label className="block text-sm font-medium text-muted-foreground mb-1">
 参赛密码 <span className="text-error">*</span>
 </label>
 <input
 type="text"
 required
 value={password}
 onChange={(e) => setPassword(e.target.value)}
 className="input"
 placeholder="请设置参赛密码"
 />
 </div>
 )}
 </div>
 </div>

 <div className="card p-8 space-y-6">
 <div className="flex justify-between items-center border-b border-border pb-4">
 <h2 className="text-lg font-bold text-foreground">题目管理</h2>
 <span className="tag">
 已添加 {contestProblems.length} 题
 </span>
 </div>
 
 <div className="space-y-6">
 <div className="card-static p-5 rounded-xl transition-all">
 <label className="block text-sm font-bold text-primary-light mb-2">
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
 className="btn btn-primary whitespace-nowrap"
 >
 <Plus className="w-4 h-4" />
 {searching ? '添加中...' : '批量添加'}
 </button>
 </div>
 <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
 <AlertCircle className="w-3 h-3" />
 提示：直接输入数字（如 1001）将自动识别为 P1001。仅能添加已公开的题目。
 </p>
 </div>

 <div className="relative">
 <label className="block text-sm font-medium text-muted-foreground mb-2">
 搜索添加题目
 </label>
 <div className="relative">
 <input
 type="text"
 placeholder="输入题目名称或题号进行搜索..."
 value={searchQuery}
 onChange={(e) => {
 setSearchQuery(e.target.value)
 searchProblems(e.target.value)
 }}
 className="input pl-10"
 />
 <Search className="w-5 h-5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
 </div>
 
 {searchResults.length > 0 && (
 <div className="absolute top-full left-0 right-0 mt-2 card rounded-xl shadow-xl z-20 max-h-80 overflow-y-auto divide-y divide-border">
 {searchResults.map(problem => (
 <button
 key={problem.id}
 type="button"
 onClick={() => handleAddProblem(problem)}
 className="w-full px-5 py-3 text-left hover:bg-primary/5 flex justify-between items-center group transition-colors"
 >
 <div className="flex items-center gap-3">
 <span className="font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded text-sm group-hover:bg-primary/10 group-hover:text-primary-light transition-colors">
 {problem.problemNumber}
 </span>
 <span className="font-medium text-foreground group-hover:text-primary-light">{problem.title}</span>
 </div>
 <div className="flex items-center gap-3">
 <span className={`text-xs px-2 py-1 rounded font-medium ${
 problem.difficulty === '入门' ? 'bg-secondary/10 text-secondary-light' :
 problem.difficulty.includes('普及') ? 'bg-accent/10 text-accent-light' :
 'bg-error/10 text-error'
 }`}>
 {problem.difficulty}
 </span>
 <Plus className="w-4 h-4 text-muted-foreground group-hover:text-primary-light" />
 </div>
 </button>
 ))}
 </div>
 )}
 </div>

 <div className="border border-border rounded-xl overflow-hidden">
 {contestProblems.length === 0 ? (
 <div className="py-16 text-center">
 <div className="bg-muted w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
 <Search className="w-8 h-8 text-muted-foreground/50" />
 </div>
 <p className="text-muted-foreground font-medium">暂无题目</p>
 <p className="text-sm text-muted-foreground/60 mt-1">请使用上方工具搜索或批量添加题目</p>
 </div>
 ) : (
 <div className="divide-y divide-border">
 {contestProblems.map((problem, index) => (
 <div key={problem.id} className="p-4 flex items-center justify-between hover:bg-primary/5 transition-colors group">
 <div className="flex items-center gap-4">
 <span className="w-8 h-8 flex items-center justify-center bg-muted text-muted-foreground rounded-lg text-sm font-bold group-hover:bg-primary/10 group-hover:text-primary-light transition-colors">
 {String.fromCharCode(65 + index)}
 </span>
 <div className="flex flex-col">
 <div className="flex items-center gap-2">
 <span className="font-mono text-sm text-muted-foreground">{problem.problemNumber}</span>
 <span className="font-medium text-foreground">{problem.title}</span>
 </div>
 <span className="text-xs text-muted-foreground/60 mt-0.5">{problem.difficulty}</span>
 </div>
 </div>
 <button
 type="button"
 onClick={() => handleRemoveProblem(problem.id)}
 className="p-2 text-muted-foreground hover:text-error hover:bg-error/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
 title="移除题目"
 >
 <Trash2 className="w-5 h-5" />
 </button>
 </div>
 ))}
 </div>
 )}
 </div>
 </div>
 </div>

 <div className="flex justify-end pt-4 pb-12">
 <button
 type="submit"
 disabled={loading}
 className="btn btn-primary px-8 py-3 text-lg font-bold"
 >
 {loading ? (
 <>
 <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
 创建中...
 </>
 ) : (
 <>
 <Save className="w-5 h-5" />
 确认创建竞赛
 </>
 )}
 </button>
 </div>
 </form>
 </div>
 </div>
 )
}
