'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import { fetchWithAuth } from '@/lib/api/base'
import {
 ArrowLeft,
 Plus,
 X,
 Save,
 Loader2,
 Edit,
 Eye,
 Trash2,
 Sparkles,
 RefreshCw,
 Clock,
 Code2,
 AlertCircle,
 MessageSquare
} from 'lucide-react'
import { DIFFICULTIES } from '@/lib/constants'
import { formatRelativeTime } from '@/lib/utils'

interface Sample {
 input: string
 output: string
 explanation?: string
}

interface AdminSolutionItem {
 id: string
 title: string
 codeLanguage: string | null
 views: number
 likes: number
 isOfficial: boolean
 isAiGenerated: boolean
 sourceType: string
 createdAt: string
 author: {
 id: string
 username: string
 nickname: string | null
 avatar: string | null
 }
}

export default function EditProblemPage() {
 const router = useRouter()
 const params = useParams()
 const problemId = params.id as string

 const [loading, setLoading] = useState(true)
 const [submitting, setSubmitting] = useState(false)
 const [error, setError] = useState('')

 const [problemNumber, setProblemNumber] = useState('')
 const [title, setTitle] = useState('')
 const [difficulty, setDifficulty] = useState('入门')
 const [tags, setTags] = useState<string[]>([])
 const [tagInput, setTagInput] = useState('')
 const [timeLimit, setTimeLimit] = useState(1000)
 const [memoryLimit, setMemoryLimit] = useState(128)
 const [comparisonMode, setComparisonMode] = useState('default')
 const [realPrecision, setRealPrecision] = useState(3)
 const [visibility, setVisibility] = useState('public')

 const [description, setDescription] = useState('')
 const [input, setInput] = useState('')
 const [output, setOutput] = useState('')
 const [hint, setHint] = useState('')
 const [source, setSource] = useState('')

 const [samples, setSamples] = useState<Sample[]>([{ input: '', output: '', explanation: '' }])

 // 题解管理
 const [solutions, setSolutions] = useState<AdminSolutionItem[]>([])
 const [solutionsLoading, setSolutionsLoading] = useState(true)
 const [solutionsError, setSolutionsError] = useState('')
 const [deletingSolutionId, setDeletingSolutionId] = useState<string | null>(null)
 const [regenerating, setRegenerating] = useState(false)
 const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

 // 题解生成轮询（使用 ref 避免 setInterval 闭包内拿到过期 state）
 const pollingRef = useRef<{ logId: string; intervalId: ReturnType<typeof setInterval> | null }>({ logId: '', intervalId: null })

 const fetchProblemData = useCallback(async () => {
 try {
 setLoading(true)
 setError('')
 const response = await fetchWithAuth(`/api/admin/problems/${problemId}`)

 if (!response.ok) {
 let detail = `HTTP ${response.status}`
 try {
 const body = await response.json().catch(() => null)
 if (body?.error) detail = `${body.error.code || ''} ${body.error.message || body.error}`.trim()
 else if (body?.message) detail = body.message
 } catch {
 // ignore JSON parse errors
 }
 throw new Error(detail)
 }

 const data = await response.json()

 if (data.success) {
 const problem = data.data
 setProblemNumber(problem.problemNumber || '')
 setTitle(problem.title || '')
 setDescription(problem.description || '')
 setInput(problem.input || '')
 setOutput(problem.output || '')
 setHint(problem.hint || '')
 setSource(problem.source || '')
 setDifficulty(problem.difficulty || '入门')
 setTags(Array.isArray(problem.tags) ? problem.tags : [])
 setTimeLimit(typeof problem.timeLimit === 'number' ? problem.timeLimit : 1000)
 setMemoryLimit(typeof problem.memoryLimit === 'number' ? problem.memoryLimit : 128)
 setComparisonMode(problem.comparisonMode || 'default')
 setRealPrecision(typeof problem.realPrecision === 'number' ? problem.realPrecision : 3)
 setVisibility(problem.visibility || (problem.isPublic ? 'public' : 'private'))
 setSamples(
 Array.isArray(problem.samples) && problem.samples.length > 0
 ? problem.samples
 : [{ input: '', output: '', explanation: '' }]
 )
 } else {
 setError(data.error?.message || data.message || '获取题目数据失败')
 }
 } catch (err: any) {
 setError(err?.message || '网络错误，请稍后重试')
 } finally {
 setLoading(false)
 }
 }, [problemId])

 useEffect(() => {
 fetchProblemData()
 }, [problemId, fetchProblemData])

 const fetchSolutions = useCallback(async () => {
 try {
 setSolutionsLoading(true)
 setSolutionsError('')
 const response = await fetchWithAuth(
 `/api/solutions?problemId=${problemId}&pageSize=100`
 )
 if (!response.ok) {
 throw new Error(`HTTP ${response.status}`)
 }
 const data = await response.json()
 if (data.success) {
 const list = Array.isArray(data.data?.items)
 ? data.data.items
 : Array.isArray(data.data?.solutions)
 ? data.data.solutions
 : Array.isArray(data.data)
 ? data.data
 : []
 setSolutions(list as AdminSolutionItem[])
 } else {
 setSolutionsError(data.error || '获取题解列表失败')
 }
 } catch (err: any) {
 setSolutionsError(err?.message || '网络错误')
 } finally {
 setSolutionsLoading(false)
 }
 }, [problemId])

 useEffect(() => {
 fetchSolutions()
 }, [problemId, fetchSolutions])

 const handleViewSolution = (solutionId: string) => {
 router.push(`/problems/${problemId}/solutions/${solutionId}`)
 }

 const handleDeleteSolution = async (solutionId: string) => {
 const ok = window.confirm('确定要删除此题解吗？此操作不可撤销。')
 if (!ok) return
 try {
 setDeletingSolutionId(solutionId)
 const response = await fetchWithAuth(`/api/solutions/${solutionId}`, {
 method: 'DELETE'
 })
 const data = await response.json().catch(() => null)
 if (response.ok && data?.success) {
 setActionMessage({ type: 'success', text: '题解已删除' })
 setSolutions((prev) => prev.filter((s) => s.id !== solutionId))
 } else {
 setActionMessage({
 type: 'error',
 text: data?.error || '删除题解失败'
 })
 }
 } catch (err: any) {
 setActionMessage({ type: 'error', text: err?.message || '网络错误' })
 } finally {
 setDeletingSolutionId(null)
 setTimeout(() => setActionMessage(null), 3000)
 }
 }

 const stopSolutionPolling = useCallback(() => {
 if (pollingRef.current.intervalId) {
 clearInterval(pollingRef.current.intervalId)
 }
 pollingRef.current = { logId: '', intervalId: null }
 }, [])

 const startSolutionPolling = useCallback((logId: string) => {
 // 清理旧轮询，避免重复轮询
 if (pollingRef.current.intervalId) {
 clearInterval(pollingRef.current.intervalId)
 }

 const poll = async () => {
 // 页面不可见时跳过本轮，等切回时由 visibilitychange 触发
 if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
 try {
 const res = await fetchWithAuth(`/api/admin/ai/solution/status?logId=${logId}`)
 const data = await res.json()
 if (!data.success) return

 const { status, error } = data.data || {}
 if (status === 'COMPLETED') {
 stopSolutionPolling()
 fetchSolutions() // 刷新题解列表
 setActionMessage({ type: 'success', text: '题解生成完成' })
 setTimeout(() => setActionMessage(null), 4000)
 } else if (status === 'FAILED') {
 stopSolutionPolling()
 setActionMessage({ type: 'error', text: error || '题解生成失败' })
 setTimeout(() => setActionMessage(null), 4000)
 }
 // PENDING/PROCESSING 继续轮询
 } catch (e) {
 console.error('轮询题解状态失败', e)
 }
 }

 // 立即轮询一次，然后每 2s 轮询
 poll()
 const intervalId = setInterval(poll, 2000)
 pollingRef.current = { logId, intervalId }
 }, [fetchSolutions, stopSolutionPolling])

 // 可见性感知：切回页面时立即轮询一次
 useEffect(() => {
 const onVisibilityChange = () => {
 if (document.visibilityState === 'visible' && pollingRef.current.logId) {
 const currentLogId = pollingRef.current.logId
 fetchWithAuth(`/api/admin/ai/solution/status?logId=${currentLogId}`)
 .then((r) => r.json())
 .then((data) => {
 if (!data.success) return
 const { status, error } = data.data || {}
 if (status === 'COMPLETED') {
 stopSolutionPolling()
 fetchSolutions()
 setActionMessage({ type: 'success', text: '题解生成完成' })
 setTimeout(() => setActionMessage(null), 4000)
 } else if (status === 'FAILED') {
 stopSolutionPolling()
 setActionMessage({ type: 'error', text: error || '题解生成失败' })
 setTimeout(() => setActionMessage(null), 4000)
 }
 })
 .catch(() => {})
 }
 }
 document.addEventListener('visibilitychange', onVisibilityChange)
 return () => document.removeEventListener('visibilitychange', onVisibilityChange)
 }, [fetchSolutions, stopSolutionPolling])

 // 组件卸载时清理轮询
 useEffect(() => {
 return () => {
 if (pollingRef.current.intervalId) {
 clearInterval(pollingRef.current.intervalId)
 }
 }
 }, [])

 const handleRegenerateSolution = async () => {
 const ok = window.confirm(
 '将删除原 AI 官方题解并重新生成。确定继续吗？'
 )
 if (!ok) return
 try {
 setRegenerating(true)
 setActionMessage(null)
 const response = await fetchWithAuth(
 `/api/admin/problems/${problemId}/regenerate-solution`,
 { method: 'POST' }
 )
 const data = await response.json().catch(() => null)
 if (response.ok && data?.success) {
 const logId = data.data?.logId
 setActionMessage({ type: 'success', text: 'AI 题解已重新入队生成' })
 if (logId) {
 // 启动轮询，等待生成完成后自动刷新
 startSolutionPolling(logId)
 } else {
 // 兼容无 logId 的旧接口：直接刷新
 await fetchSolutions()
 }
 } else {
 setActionMessage({
 type: 'error',
 text: data?.error || '重新生成失败'
 })
 }
 } catch (err: any) {
 setActionMessage({ type: 'error', text: err?.message || '网络错误' })
 } finally {
 setRegenerating(false)
 setTimeout(() => setActionMessage(null), 4000)
 }
 }

 const handleAddTag = () => {
 if (tagInput.trim() && !tags.includes(tagInput.trim())) {
 setTags([...tags, tagInput.trim()])
 setTagInput('')
 }
 }

 const handleRemoveTag = (index: number) => {
 setTags(tags.filter((_, i) => i !== index))
 }

 const handleAddSample = () => {
 setSamples([...samples, { input: '', output: '', explanation: '' }])
 }

 const handleRemoveSample = (index: number) => {
 setSamples(samples.filter((_, i) => i !== index))
 }

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault()
 
 if (!title.trim()) {
 setError('请填写题目标题')
 return
 }

 if (!description.trim()) {
 setError('请填写题目描述')
 return
 }

 setSubmitting(true)
 setError('')

 try {
 const response = await fetchWithAuth(`/api/admin/problems/${problemId}`, {
 method: 'PATCH',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 problemNumber: problemNumber.trim() || null,
 title: title.trim(),
 description,
 input,
 output,
 samples: samples.filter(s => s.input || s.output),
 hint: hint || null,
 source: source || null,
 difficulty,
 tags,
 timeLimit,
 memoryLimit,
 comparisonMode,
 realPrecision: comparisonMode === 'real-number' ? realPrecision : 3,
 isPublic: visibility === 'public',
 visibility
 })
 })

 const data = await response.json()

 if (data.success) {
 router.push('/admin/problems')
 } else {
 setError(data.error?.message || data.error || '更新失败')
 }
 } catch (err: any) {
 setError(err?.message || '网络错误，请稍后重试')
 } finally {
 setSubmitting(false)
 }
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
 <div className="max-w-5xl mx-auto space-y-6">
 <div className="flex items-center gap-4">
 <button
 onClick={() => router.back()}
 className="p-2 hover:bg-muted rounded-lg transition-colors"
 >
 <ArrowLeft className="w-5 h-5 text-muted-foreground" />
 </button>
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-xl flex items-center justify-center"
 style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)' }}>
 <Edit className="w-5 h-5 text-white" />
 </div>
 <div>
 <h1 className="text-2xl font-bold text-foreground">编辑题目</h1>
 <p className="text-sm text-muted-foreground">修改题目基本信息和描述</p>
 </div>
 </div>
 </div>

 {error && (
 <div className="bg-error/10 border border-error/30 text-error px-4 py-3 rounded-lg flex items-center gap-2">
 <AlertCircle className="w-5 h-5 flex-shrink-0" />
 <span>{error}</span>
 </div>
 )}

 <form onSubmit={handleSubmit} className="space-y-6">
 <div className="card p-6 space-y-4">
 <h2 className="text-lg font-bold text-foreground mb-4">基本信息</h2>
 
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div>
 <label className="block text-sm font-medium text-foreground mb-2">
 题目编号（可选）
 </label>
 <input
 type="text"
 value={problemNumber}
 onChange={(e) => setProblemNumber(e.target.value)}
 placeholder="如：P1001"
 className="input"
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-foreground mb-2">
 难度 <span className="text-error">*</span>
 </label>
 <select
 value={difficulty}
 onChange={(e) => setDifficulty(e.target.value)}
 className="input"
 >
 {DIFFICULTIES.map(diff => (
 <option key={diff} value={diff}>{diff}</option>
 ))}
 </select>
 </div>
 </div>

 <div>
 <label className="block text-sm font-medium text-foreground mb-2">
 题目标题 <span className="text-error">*</span>
 </label>
 <input
 type="text"
 value={title}
 onChange={(e) => setTitle(e.target.value)}
 placeholder="输入题目标题"
 className="input"
 required
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-foreground mb-2">标签</label>
 <div className="flex gap-2 mb-2">
 <input
 type="text"
 value={tagInput}
 onChange={(e) => setTagInput(e.target.value)}
 onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
 placeholder="输入标签后按回车"
 className="input flex-1"
 />
 <button
 type="button"
 onClick={handleAddTag}
 className="btn btn-primary"
 >
 添加
 </button>
 </div>
 <div className="flex flex-wrap gap-2">
 {tags.map((tag, idx) => (
 <span
 key={idx}
 className="tag flex items-center gap-2"
 >
 {tag}
 <button
 type="button"
 onClick={() => handleRemoveTag(idx)}
 className="hover:text-error"
 >
 ×
 </button>
 </span>
 ))}
 </div>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div>
 <label className="block text-sm font-medium text-foreground mb-2">
 时间限制（ms）
 </label>
 <input
 type="number"
 value={timeLimit}
 onChange={(e) => setTimeLimit(parseInt(e.target.value) || 1000)}
 min="100"
 max="10000"
 className="input"
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-foreground mb-2">
 内存限制（MB）
 </label>
 <input
 type="number"
 value={memoryLimit}
 onChange={(e) => setMemoryLimit(parseInt(e.target.value) || 128)}
 min="32"
 max="1024"
 className="input"
 />
 </div>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div>
 <label className="block text-sm font-medium text-foreground mb-2">
 输出比较模式
 </label>
 <select
 value={comparisonMode}
 onChange={(e) => setComparisonMode(e.target.value)}
 className="input"
 >
 <option value="default">默认（NOI 忽略行末空格）</option>
 <option value="strict">严格逐行匹配</option>
 <option value="ignore-spaces">忽略所有空白</option>
 <option value="real-number">浮点数比较</option>
 </select>
 </div>

 <div>
 {comparisonMode === 'real-number' ? (
 <>
 <label className="block text-sm font-medium text-foreground mb-2">
 精度（小数位数）
 </label>
 <input
 type="number"
 value={realPrecision}
 onChange={(e) => setRealPrecision(parseInt(e.target.value) || 3)}
 min="0"
 max="12"
 className="input"
 />
 </>
 ) : (
 <p className="text-xs text-muted-foreground pt-7">
 {comparisonMode === 'default' && 'NOI 规则：忽略每行行末多余空格与文件末尾多余空行'}
 {comparisonMode === 'strict' && '逐字符严格比较，所有空白与换行均参与对比'}
 {comparisonMode === 'ignore-spaces' && '比较时忽略所有空白字符（含空格、制表符、换行）'}
 </p>
 )}
 </div>
 </div>

 <div className="flex items-center gap-4">
 <label className="text-sm font-medium text-foreground">题目可见性：</label>
 <select
 value={visibility}
 onChange={(e) => setVisibility(e.target.value)}
 className="input w-auto"
 >
 <option value="public">公开 (Public)</option>
 <option value="private">隐藏 (Private)</option>
 <option value="contest">竞赛专用 (Contest)</option>
 </select>
 <span className="text-xs text-muted-foreground">
 {visibility === 'public' && '题目将在题库中对所有用户可见'}
 {visibility === 'private' && '题目仅管理员可见（草稿状态）'}
 {visibility === 'contest' && '题目仅在竞赛中可见'}
 </span>
 </div>
 </div>

 <div className="card p-6 space-y-4">
 <h2 className="text-lg font-bold text-foreground mb-4">题目描述</h2>
 
 <div>
 <label className="block text-sm font-medium text-foreground mb-2">
 题目描述 <span className="text-error">*</span>
 </label>
 <textarea
 value={description}
 onChange={(e) => setDescription(e.target.value)}
 rows={8}
 placeholder="详细描述题目要求..."
 className="input min-h-[200px] font-mono text-sm"
 required
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-foreground mb-2">输入格式</label>
 <textarea
 value={input}
 onChange={(e) => setInput(e.target.value)}
 rows={4}
 placeholder="描述输入格式..."
 className="input font-mono text-sm"
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-foreground mb-2">输出格式</label>
 <textarea
 value={output}
 onChange={(e) => setOutput(e.target.value)}
 rows={4}
 placeholder="描述输出格式..."
 className="input font-mono text-sm"
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-foreground mb-2">提示（可选）</label>
 <textarea
 value={hint}
 onChange={(e) => setHint(e.target.value)}
 rows={3}
 placeholder="给出解题提示..."
 className="input font-mono text-sm"
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-foreground mb-2">来源（可选）</label>
 <input
 type="text"
 value={source}
 onChange={(e) => setSource(e.target.value)}
 placeholder="如：NOIP 2020 普及组"
 className="input"
 />
 </div>
 </div>

 <div className="card p-6 space-y-4">
 <div className="flex justify-between items-center mb-4">
 <h2 className="text-lg font-bold text-foreground">样例</h2>
 <button
 type="button"
 onClick={handleAddSample}
 className="btn btn-ghost text-sm flex items-center gap-1"
 >
 <Plus className="w-4 h-4" />
 添加样例
 </button>
 </div>

 {samples.map((sample, idx) => (
 <div key={idx} className="p-4 rounded-lg bg-muted border border-border space-y-3">
 <div className="flex justify-between items-center">
 <h3 className="font-medium text-foreground">样例 {idx + 1}</h3>
 {samples.length > 1 && (
 <button
 type="button"
 onClick={() => handleRemoveSample(idx)}
 className="text-error hover:text-error/80"
 >
 <X className="w-4 h-4" />
 </button>
 )}
 </div>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div>
 <label className="block text-sm font-medium text-muted-foreground mb-2">输入</label>
 <textarea
 value={sample.input}
 onChange={(e) => {
 const newSamples = [...samples]
 newSamples[idx].input = e.target.value
 setSamples(newSamples)
 }}
 rows={3}
 className="input font-mono text-sm"
 />
 </div>
 <div>
 <label className="block text-sm font-medium text-muted-foreground mb-2">输出</label>
 <textarea
 value={sample.output}
 onChange={(e) => {
 const newSamples = [...samples]
 newSamples[idx].output = e.target.value
 setSamples(newSamples)
 }}
 rows={3}
 className="input font-mono text-sm"
 />
 </div>
 </div>
 <div>
 <label className="block text-sm font-medium text-muted-foreground mb-2">说明（可选）</label>
 <input
 type="text"
 value={sample.explanation || ''}
 onChange={(e) => {
 const newSamples = [...samples]
 newSamples[idx].explanation = e.target.value
 setSamples(newSamples)
 }}
 className="input text-sm"
 />
 </div>
 </div>
 ))}
 </div>

 <div className="flex gap-4">
 <button
 type="button"
 onClick={() => router.back()}
 className="btn btn-ghost flex-1"
 >
 取消
 </button>
 <button
 type="submit"
 disabled={submitting}
 className="btn btn-primary flex-1 flex items-center justify-center gap-2"
 >
 {submitting ? (
 <>
 <Loader2 className="w-4 h-4 animate-spin" />
 更新中...
 </>
 ) : (
 <>
 <Save className="w-4 h-4" />
 更新题目
 </>
 )}
 </button>
 </div>
 </form>

 <section className="card p-6 space-y-4" aria-label="题解管理">
 <div className="flex flex-wrap items-center justify-between gap-3">
 <div className="flex items-center gap-3">
 <div
 className="w-10 h-10 rounded-xl flex items-center justify-center"
 style={{
 background:
 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)'
 }}
 >
 <MessageSquare className="w-5 h-5 text-white" />
 </div>
 <div>
 <h2 className="text-lg font-bold text-foreground">
 题解管理（{solutions.length}）
 </h2>
 <p className="text-xs text-muted-foreground">
 管理该题下的所有题解，AI 题解可一键重新生成
 </p>
 </div>
 </div>
 <button
 type="button"
 onClick={handleRegenerateSolution}
 disabled={regenerating}
 className="btn btn-primary text-sm flex items-center gap-2"
 title="删除原 AI 官方题解并重新入队生成"
 >
 {regenerating ? (
 <Loader2 className="w-4 h-4 animate-spin" />
 ) : (
 <RefreshCw className="w-4 h-4" />
 )}
 AI 重新生成
 </button>
 </div>

 {actionMessage && (
 <div
 className={`px-4 py-3 rounded-lg text-sm border ${
 actionMessage.type === 'success'
 ? 'bg-success/10 border-success/30 text-success'
 : 'bg-error/10 border-error/30 text-error'
 }`}
 >
 {actionMessage.text}
 </div>
 )}

 {solutionsLoading && (
 <div className="space-y-3" aria-busy="true" aria-live="polite">
 {[0, 1, 2].map((i) => (
 <div
 key={i}
 className="rounded-lg bg-muted border border-border p-4 animate-pulse"
 >
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-full bg-muted" />
 <div className="flex-1 space-y-2">
 <div className="h-3 w-2/3 bg-muted rounded" />
 <div className="h-3 w-1/3 bg-muted rounded" />
 </div>
 </div>
 </div>
 ))}
 </div>
 )}

 {!solutionsLoading && solutionsError && (
 <div className="bg-error/10 border border-error/30 text-error px-4 py-3 rounded-lg flex items-center gap-2">
 <AlertCircle className="w-4 h-4" />
 <span>{solutionsError}</span>
 </div>
 )}

 {!solutionsLoading && !solutionsError && solutions.length === 0 && (
 <div className="text-center py-12 rounded-lg bg-muted border border-border">
 <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
 <MessageSquare className="w-7 h-7 text-muted-foreground" />
 </div>
 <p className="text-muted-foreground">暂无题解</p>
 </div>
 )}

 {!solutionsLoading && !solutionsError && solutions.length > 0 && (
 <div className="space-y-3">
 {solutions.map((s) => (
 <div
 key={s.id}
 className="rounded-xl bg-card border border-border p-4 hover:border-primary/50 hover:shadow-md transition-all relative overflow-hidden"
 >
 {s.isAiGenerated && (
 <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-purple-500 to-purple-700" />
 )}
 <div className="flex items-start gap-3 flex-wrap">
 <div className="flex items-start gap-3 flex-1 min-w-0">
 <div className="avatar avatar-md flex-shrink-0">
 {s.author?.avatar ? (
 <img
 src={s.author.avatar}
 alt={s.author.nickname || s.author.username}
 className="w-full h-full object-cover"
 />
 ) : (
 <div className="avatar-fallback text-sm">
 {(s.author?.nickname || s.author?.username || '?')
 .charAt(0)
 .toUpperCase()}
 </div>
 )}
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 mb-1 flex-wrap">
 <h3 className="text-sm font-semibold text-foreground line-clamp-1">
 {s.title}
 </h3>
 {s.isAiGenerated && (
 <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gradient-to-r from-purple-500 to-purple-700 text-white">
 <Sparkles className="w-3 h-3" />
 AI 生成
 </span>
 )}
 {s.isOfficial && (
 <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gradient-to-r from-amber-400 to-yellow-500 text-amber-950">
 标程
 </span>
 )}
 </div>
 <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
 <span className="text-foreground">
 {s.author?.nickname || s.author?.username || '匿名'}
 </span>
 <span className="opacity-50">·</span>
 <span className="inline-flex items-center gap-1">
 <Clock className="w-3 h-3" />
 {formatRelativeTime(s.createdAt)}
 </span>
 {s.codeLanguage && (
 <>
 <span className="opacity-50">·</span>
 <span className="inline-flex items-center gap-1">
 <Code2 className="w-3 h-3" />
 {s.codeLanguage}
 </span>
 </>
 )}
 <span className="opacity-50">·</span>
 <span>👁 {s.views}</span>
 <span>👍 {s.likes}</span>
 </div>
 </div>
 </div>
 <div className="flex items-center gap-2 flex-shrink-0">
 <button
 type="button"
 onClick={() => handleViewSolution(s.id)}
 className="px-3 py-1.5 text-xs rounded-lg bg-muted hover:bg-primary/10 text-foreground hover:text-primary border border-border hover:border-primary/40 transition-colors flex items-center gap-1"
 >
 <Eye className="w-3.5 h-3.5" />
 查看
 </button>
 {s.isAiGenerated && (
 <button
 type="button"
 onClick={handleRegenerateSolution}
 disabled={regenerating}
 className="px-3 py-1.5 text-xs rounded-lg bg-gradient-to-r from-purple-500 to-purple-700 hover:from-purple-600 hover:to-purple-800 text-white border border-purple-600/50 flex items-center gap-1 shadow-sm transition-all"
 title="删除此题解并重新生成"
 >
 {regenerating ? (
 <Loader2 className="w-3.5 h-3.5 animate-spin" />
 ) : (
 <RefreshCw className="w-3.5 h-3.5" />
 )}
 AI 重新生成
 </button>
 )}
 <button
 type="button"
 onClick={() => handleDeleteSolution(s.id)}
 disabled={deletingSolutionId === s.id}
 className="px-3 py-1.5 text-xs rounded-lg bg-error/10 hover:bg-error/20 text-error border border-error/30 hover:border-error/50 transition-colors flex items-center gap-1"
 >
 {deletingSolutionId === s.id ? (
 <Loader2 className="w-3.5 h-3.5 animate-spin" />
 ) : (
 <Trash2 className="w-3.5 h-3.5" />
 )}
 删除
 </button>
 </div>
 </div>
 </div>
 ))}
 </div>
 )}
 </section>
 </div>
 </AdminLayout>
 )
}
