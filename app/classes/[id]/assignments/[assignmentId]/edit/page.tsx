'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useUser } from '@/contexts/UserContext'
import { fetchWithAuth } from '@/lib/api/base'
import { BookOpen, AlertCircle, Trash2, ArrowLeft, Save } from 'lucide-react'
import { getDifficultyColor } from '@/lib/status'

interface Problem {
 id: string
 problemNumber: string
 title: string
 difficulty: string
 tags: string[]
}

interface Assignment {
 id: string
 title: string
 description: string
 startTime: string
 endTime: string
 problems: Problem[]
}

export default function EditAssignmentPage() {
 const params = useParams()
 const router = useRouter()
 const { user } = useUser()
 const classId = params.id as string
 const assignmentId = params.assignmentId as string

 const [loading, setLoading] = useState(false)
 const [dataLoading, setDataLoading] = useState(true)
 const [error, setError] = useState('')
 const [success, setSuccess] = useState('')

 const [problems, setProblems] = useState<Problem[]>([])
 const [selectedProblems, setSelectedProblems] = useState<string[]>([])
 const [searchQuery, setSearchQuery] = useState('')
 const [difficultyFilter, setDifficultyFilter] = useState<string>('all')

 const [formData, setFormData] = useState({
 title: '',
 description: '',
 startTime: '',
 endTime: ''
 })

 const formatDateForInput = (dateString: string) => {
 if (!dateString) return ''
 const date = new Date(dateString)
 const offset = date.getTimezoneOffset() * 60000
 return new Date(date.getTime() - offset).toISOString().slice(0, 16)
 }

 useEffect(() => {
 if (!user) {
 router.push('/login')
 return
 }
 fetchData()
 }, [user, classId, assignmentId])

 const fetchData = async () => {
 try {
 setDataLoading(true)

 const [assignmentRes, problemsRes] = await Promise.all([
 fetchWithAuth(`/api/classes/${classId}/assignments/${assignmentId}`),
 fetch('/api/problems?pageSize=100&isPublic=true')
 ])

 const assignmentData = await assignmentRes.json()
 const problemsData = await problemsRes.json()

 if (!assignmentData.success) throw new Error(assignmentData.error || '获取作业详情失败')
 if (!problemsData.success) throw new Error(problemsData.error || '获取题目列表失败')

 const assignment: Assignment = assignmentData.data.assignment

 setFormData({
 title: assignment.title,
 description: assignment.description || '',
 startTime: formatDateForInput(assignment.startTime),
 endTime: formatDateForInput(assignment.endTime)
 })

 setSelectedProblems(assignment.problems.map(p => p.id))
 setProblems(problemsData.data.problems || [])
 } catch (err: unknown) {
 setError((err as Error).message || '获取数据失败')
 } finally {
 setDataLoading(false)
 }
 }

 const toggleProblem = (problemId: string) => {
 if (selectedProblems.includes(problemId)) {
 setSelectedProblems(selectedProblems.filter(id => id !== problemId))
 } else {
 setSelectedProblems([...selectedProblems, problemId])
 }
 }

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault()
 setError('')
 setSuccess('')

 if (!formData.title.trim()) {
 setError('请输入作业标题')
 return
 }

 if (!formData.endTime) {
 setError('请选择截止时间')
 return
 }

 if (selectedProblems.length === 0) {
 setError('请至少选择一个题目')
 return
 }

 const endTime = new Date(formData.endTime)
 if (formData.startTime) {
 const startTime = new Date(formData.startTime)
 if (startTime >= endTime) {
 setError('开始时间必须早于截止时间')
 return
 }
 }

 try {
 setLoading(true)

 const response = await fetchWithAuth(`/api/classes/${classId}/assignments/${assignmentId}`, {
 method: 'PUT',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 title: formData.title,
 description: formData.description,
 startTime: formData.startTime ? new Date(formData.startTime) : undefined,
 endTime: new Date(formData.endTime),
 deadline: new Date(formData.endTime),
 problemIds: selectedProblems
 })
 })

 const data = await response.json()

 if (data.success) {
 setSuccess('作业更新成功')
 setTimeout(() => {
 router.push(`/classes/${classId}/assignments/${assignmentId}`)
 }, 1500)
 } else {
 setError(data.error || '更新失败')
 }
 } catch (err) {
 setError('更新失败，请重试')
 } finally {
 setLoading(false)
 }
 }

 const handleDelete = async () => {
 if (!confirm('确定要删除这个作业吗？此操作不可恢复，所有提交记录也将被删除。')) return

 try {
 setLoading(true)
 const response = await fetchWithAuth(`/api/classes/${classId}/assignments/${assignmentId}`, {
 method: 'DELETE'
 })
 const data = await response.json()
 if (data.success) {
 router.push(`/classes/${classId}?tab=assignments`)
 } else {
 setError(data.error || '删除失败')
 setLoading(false)
 }
 } catch (err) {
 setError('删除失败，请重试')
 setLoading(false)
 }
 }

 const filteredProblems = problems.filter(problem => {
 const matchesSearch =
 problem.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
 (problem.problemNumber && problem.problemNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
 problem.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
 return matchesSearch && (difficultyFilter === 'all' || problem.difficulty === difficultyFilter)
 })

 const difficultyOptions = [
 { key: 'all', label: '全部' },
 { key: 'easy', label: '简单' },
 { key: 'medium', label: '中等' },
 { key: 'hard', label: '困难' }
 ]

 if (dataLoading) {
 return (
 <div className="min-h-screen flex items-center justify-center">
 <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
 </div>
 )
 }

 if (!user) return null

 return (
 <div className="min-h-screen bg-background">
 <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
 <div className="flex items-center justify-between mb-8">
 <div>
 <button
 onClick={() => router.back()}
 className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-2 transition-colors"
 >
 <ArrowLeft className="w-4 h-4" />
 返回
 </button>
 <h1 className="text-2xl font-bold text-foreground">编辑作业</h1>
 <p className="mt-1 text-sm text-muted-foreground">修改作业信息或题目</p>
 </div>
 <button
 type="button"
 onClick={handleDelete}
 className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-error bg-error/5 border border-error/15 rounded-lg hover:bg-error/10 transition-colors"
 >
 <Trash2 className="w-3.5 h-3.5" />
 删除作业
 </button>
 </div>

 <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
 <div className="p-6">
 <form onSubmit={handleSubmit}>
 <div className="space-y-5">
 <div>
 <label className="block text-sm font-medium text-foreground mb-1.5">
 作业标题 <span className="text-error">*</span>
 </label>
 <input
 type="text"
 value={formData.title}
 onChange={(e) => setFormData({ ...formData, title: e.target.value })}
 placeholder="例如：第一周练习作业"
 className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors"
 required
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-foreground mb-1.5">
 作业描述
 </label>
 <textarea
 value={formData.description}
 onChange={(e) => setFormData({ ...formData, description: e.target.value })}
 placeholder="描述作业要求和注意事项"
 rows={3}
 className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm resize-y focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors"
 />
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <div>
 <label className="block text-sm font-medium text-foreground mb-1.5">
 开始时间
 </label>
 <input
 type="datetime-local"
 value={formData.startTime}
 onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
 className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors"
 />
 <p className="mt-1.5 text-xs text-muted-foreground">留空则保持原开始时间</p>
 </div>
 <div>
 <label className="block text-sm font-medium text-foreground mb-1.5">
 截止时间 <span className="text-error">*</span>
 </label>
 <input
 type="datetime-local"
 value={formData.endTime}
 onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
 className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors"
 required
 />
 </div>
 </div>

 <div>
 <label className="block text-sm font-medium text-foreground mb-1.5">
 选择题目 <span className="text-error">*</span>
 </label>

 <div className="space-y-3">
 <input
 type="text"
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 placeholder="搜索题目编号、标题或标签..."
 className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors"
 />
 <div className="flex gap-1.5">
 {difficultyOptions.map(opt => (
 <button
 key={opt.key}
 type="button"
 onClick={() => setDifficultyFilter(opt.key)}
 className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
 difficultyFilter === opt.key
 ? 'bg-primary text-white shadow-sm'
 : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
 }`}
 >
 {opt.label}
 </button>
 ))}
 </div>
 </div>

 <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
 <span>已选择 <strong className="text-foreground">{selectedProblems.length}</strong> 个题目</span>
 <span>显示 {filteredProblems.length} / {problems.length}</span>
 </div>

 <div className="space-y-0 max-h-[360px] overflow-y-auto rounded-lg border border-border mt-2">
 {filteredProblems.map(problem => (
 <div
 key={problem.id}
 onClick={() => toggleProblem(problem.id)}
 className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-all border-b border-border/60 last:border-b-0 ${
 selectedProblems.includes(problem.id)
 ? 'bg-primary/5'
 : 'hover:bg-muted'
 }`}
 >
 <div className="flex items-center gap-3 min-w-0 flex-1">
 <input
 type="checkbox"
 checked={selectedProblems.includes(problem.id)}
 onChange={() => {}}
 onClick={(e) => e.stopPropagation()}
 className="w-4 h-4 rounded border-border text-primary focus:ring-primary/20 shrink-0"
 />
 <div className="min-w-0">
 <div className="flex items-center gap-2">
 {problem.problemNumber && (
 <span className="shrink-0 text-xs font-mono text-muted-foreground">{problem.problemNumber}</span>
 )}
 <span className="font-medium text-foreground text-sm truncate">{problem.title}</span>
 <span className={`shrink-0 px-1.5 py-0.5 rounded text-[11px] font-medium ${getDifficultyColor(problem.difficulty)}`}>
 {problem.difficulty}
 </span>
 </div>
 <div className="flex gap-1 mt-1 flex-wrap">
 {problem.tags.slice(0, 3).map((tag, idx) => (
 <span key={idx} className="px-1.5 py-0.5 bg-muted rounded text-[11px] text-muted-foreground">
 {tag}
 </span>
 ))}
 </div>
 </div>
 </div>
 </div>
 ))}
 </div>
 </div>

 {error && (
 <div className="p-3 rounded-lg bg-error/5 border border-error/15">
 <p className="text-sm text-error">{error}</p>
 </div>
 )}

 {success && (
 <div className="p-3 rounded-lg bg-secondary/5 border border-secondary/15">
 <p className="text-sm text-secondary font-medium">{success}</p>
 </div>
 )}

 <div className="flex gap-3 pt-2">
 <button
 type="submit"
 disabled={loading}
 className="btn-primary btn flex items-center justify-center gap-2 flex-1"
 >
 <Save className="w-4 h-4" />
 {loading ? '保存中...' : '保存修改'}
 </button>
 <button
 type="button"
 onClick={() => router.back()}
 className="btn-ghost btn"
 >
 取消
 </button>
 </div>
 </div>
 </form>
 </div>
 </div>
 </div>
 </div>
 )
}
