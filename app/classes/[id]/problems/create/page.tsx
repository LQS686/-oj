'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useUser } from '@/contexts/UserContext'
import { fetchWithCookie } from '@/lib/api/base'
import { Search, Plus, BookOpen, AlertCircle, ArrowLeft, PlusCircle } from 'lucide-react'
import { DIFFICULTIES, DIFFICULTY_COLORS, migrateDifficulty, type Difficulty } from '@/lib/constants'

interface Problem {
 id: string
 title: string
 difficulty: string
 tags: string[]
}

type CreateMode = 'select' | 'new'

export default function CreateClassProblemPage() {
 const params = useParams()
 const router = useRouter()
 const { user } = useUser()
 const [mode, setMode] = useState<CreateMode>('select')
 const [loading, setLoading] = useState(false)
 const [error, setError] = useState('')
 const [success, setSuccess] = useState('')

 const [problems, setProblems] = useState<Problem[]>([])
 const [searchQuery, setSearchQuery] = useState('')
 const [selectedProblemId, setSelectedProblemId] = useState('')
 const [searchLoading, setSearchLoading] = useState(false)

 const [formData, setFormData] = useState({
 title: '',
 description: '',
 difficulty: '普及' as Difficulty,
 tags: '',
 timeLimit: 1000,
 memoryLimit: 256
 })

 useEffect(() => {
 if (!user) {
 router.push('/login')
 return
 }
 }, [user, router])

 const searchProblems = async () => {
 if (!searchQuery.trim()) {
 setError('请输入搜索关键词')
 return
 }

 try {
 setSearchLoading(true)
 setError('')

 const response = await fetchWithCookie(`/api/problems?search=${encodeURIComponent(searchQuery)}&pageSize=20`)

 const data = await response.json()

 if (data.success) {
 setProblems(data.data.problems || [])
 if (data.data.problems.length === 0) {
 setError('未找到相关题目')
 }
 } else {
 setError(data.error || '搜索失败')
 }
 } catch (err) {
 setError('搜索失败，请重试')
 } finally {
 setSearchLoading(false)
 }
 }

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault()
 setError('')
 setSuccess('')

 if (mode === 'select') {
 if (!selectedProblemId) {
 setError('请选择一个题目')
 return
 }
 } else {
 if (!formData.title.trim() || !formData.description.trim()) {
 setError('请填写题目标题和描述')
 return
 }
 }

 try {
 setLoading(true)

 const body = mode === 'select'
 ? { type: 'existing', problemId: selectedProblemId }
 : {
 type: 'new',
 title: formData.title,
 description: formData.description,
 difficulty: formData.difficulty,
 tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
 timeLimit: formData.timeLimit,
 memoryLimit: formData.memoryLimit
 }

 const response = await fetchWithCookie(`/api/classes/${params.id}/problems`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json'
 },
 body: JSON.stringify(body)
 })

 const data = await response.json()

 if (data.success) {
 setSuccess('题目添加成功')
 setTimeout(() => {
 router.push(`/classes/${params.id}`)
 }, 1500)
 } else {
 setError(data.error || '添加失败')
 }
 } catch (err) {
 setError('添加失败，请重试')
 } finally {
 setLoading(false)
 }
 }

 const difficultyColors = DIFFICULTY_COLORS

 return (
 <div className="min-h-screen">
 <div className="container mx-auto px-4 py-8 max-w-4xl">
 <Link
 href={`/classes/${params.id}`}
 className="flex items-center gap-2 text-muted-foreground hover:text-primary-light mb-6 transition-colors group"
 >
 <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
 返回班级
 </Link>

 <div className="flex items-center gap-4 mb-8">
 <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center shadow-lg">
 <PlusCircle className="w-6 h-6 text-white" />
 </div>
 <div>
 <h1 className="text-2xl font-bold text-foreground">添加班级题目</h1>
 <p className="text-muted-foreground text-sm">从题库选择题目或创建新题目</p>
 </div>
 </div>

 <div className="card-static rounded-lg overflow-hidden">
 <div className="flex border-b border-border">
 <button
 onClick={() => setMode('select')}
 className={`flex-1 px-6 py-4 text-center font-medium transition-colors relative ${
 mode === 'select'
 ? 'text-primary-light'
 : 'text-muted-foreground hover:text-foreground'
 }`}
 >
 从题库选择
 {mode === 'select' && (
 <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
 )}
 </button>
 <button
 onClick={() => setMode('new')}
 className={`flex-1 px-6 py-4 text-center font-medium transition-colors relative ${
 mode === 'new'
 ? 'text-primary-light'
 : 'text-muted-foreground hover:text-foreground'
 }`}
 >
 创建新题目
 {mode === 'new' && (
 <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
 )}
 </button>
 </div>

 <div className="p-6">
 <form onSubmit={handleSubmit}>
 {mode === 'select' ? (
 <>
 <div className="mb-6">
 <label className="block text-sm font-medium text-foreground mb-2">
 搜索题目
 </label>
 <div className="flex gap-3">
 <div className="flex-1 relative">
 <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
 <input
 type="text"
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 placeholder="输入题目标题或标签"
 className="input pl-12"
 />
 </div>
 <button
 type="button"
 onClick={searchProblems}
 disabled={searchLoading}
 className="btn btn-primary"
 >
 <Search className="w-4 h-4" />
 {searchLoading ? '搜索中...' : '搜索'}
 </button>
 </div>
 </div>

 {problems.length > 0 && (
 <div className="mb-6">
 <label className="block text-sm font-medium text-foreground mb-2">
 选择题目
 </label>
 <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
 {problems.map(problem => (
 <div
 key={problem.id}
 onClick={() => setSelectedProblemId(problem.id)}
 className={`p-4 rounded-xl cursor-pointer transition-all border ${
 selectedProblemId === problem.id
 ? 'border-primary bg-primary/10'
 : 'border-border hover:border-primary/50 bg-muted'
 }`}
 >
 <div className="flex items-center justify-between">
 <div className="flex-1">
 <div className="flex items-center gap-3 mb-2">
 <h3 className="font-medium text-foreground">{problem.title}</h3>
 <span className={`tag ${difficultyColors[migrateDifficulty(problem.difficulty)] || ''}`}>
 {migrateDifficulty(problem.difficulty)}
 </span>
 </div>
 <div className="flex gap-1 flex-wrap">
 {problem.tags.slice(0, 4).map((tag, idx) => (
 <span key={idx} className="tag">
 {tag}
 </span>
 ))}
 </div>
 </div>
 {selectedProblemId === problem.id && (
 <div className="ml-4">
 <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center">
 <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
 </svg>
 </div>
 </div>
 )}
 </div>
 </div>
 ))}
 </div>
 </div>
 )}
 </>
 ) : (
 <>
 <div className="space-y-4">
 <div>
 <label className="block text-sm font-medium text-foreground mb-2">
 题目标题 <span className="text-error">*</span>
 </label>
 <input
 type="text"
 value={formData.title}
 onChange={(e) => setFormData({ ...formData, title: e.target.value })}
 placeholder="请输入题目标题"
 className="input"
 required
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-foreground mb-2">
 题目描述 <span className="text-error">*</span>
 </label>
 <textarea
 value={formData.description}
 onChange={(e) => setFormData({ ...formData, description: e.target.value })}
 placeholder="请输入题目描述（支持Markdown）"
 rows={10}
 className="input font-mono text-sm min-h-[250px]"
 required
 />
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div>
 <label className="block text-sm font-medium text-foreground mb-2">
 难度
 </label>
 <select
 value={formData.difficulty}
 onChange={(e) => setFormData({ ...formData, difficulty: e.target.value as Difficulty })}
 className="input"
 >
 {DIFFICULTIES.map(d => (
 <option key={d} value={d}>{d}</option>
 ))}
 </select>
 </div>

 <div>
 <label className="block text-sm font-medium text-foreground mb-2">
 标签
 </label>
 <input
 type="text"
 value={formData.tags}
 onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
 placeholder="多个标签用逗号分隔"
 className="input"
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-foreground mb-2">
 时间限制 (ms)
 </label>
 <input
 type="number"
 value={formData.timeLimit}
 onChange={(e) => setFormData({ ...formData, timeLimit: parseInt(e.target.value) })}
 min="100"
 max="10000"
 className="input"
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-foreground mb-2">
 内存限制 (MB)
 </label>
 <input
 type="number"
 value={formData.memoryLimit}
 onChange={(e) => setFormData({ ...formData, memoryLimit: parseInt(e.target.value) })}
 min="32"
 max="1024"
 className="input"
 />
 </div>
 </div>

 <div className="card-static rounded-xl p-4 border border-amber-500/20">
 <div className="flex items-start gap-3">
 <AlertCircle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
 <div className="text-sm text-accent-light">
 <p className="font-medium mb-1">提示</p>
 <p>创建题目后，您需要在题目详情页面添加测试用例才能正常使用。</p>
 </div>
 </div>
 </div>
 </div>
 </>
 )}

 {error && (
 <div className="mt-4 p-4 rounded-xl bg-error/10 border border-error/20 text-error text-sm">
 {error}
 </div>
 )}

 {success && (
 <div className="mt-4 p-4 rounded-xl bg-secondary/10 border border-secondary/20 text-secondary-light text-sm">
 {success}
 </div>
 )}

 <div className="mt-6 flex gap-3">
 <button
 type="submit"
 disabled={loading}
 className="btn btn-primary flex-1"
 >
 {loading ? '添加中...' : '添加题目'}
 </button>
 <button
 type="button"
 onClick={() => router.push(`/classes/${params.id}`)}
 className="btn btn-ghost"
 >
 取消
 </button>
 </div>
 </form>
 </div>
 </div>
 </div>
 </div>
 )
}
