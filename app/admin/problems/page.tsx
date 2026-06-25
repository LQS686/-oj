'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import { DataTable, type Column } from '@/components/admin'
import { fetchWithAuth } from '@/lib/api/base'
import { FileText, Plus, Edit, Trash2, Eye, EyeOff, Search, Trophy, Database, X, Filter, ChevronDown, Users, Clock, BarChart2 } from 'lucide-react'
import { DIFFICULTIES, DIFFICULTY_COLORS } from '@/lib/constants'

interface Problem {
 id: string
 problemNumber: string | null
 title: string
 description?: string
 input?: string
 output?: string
 samples?: { input: string; output: string }[]
 hint?: string
 source?: string
 difficulty: string
 tags: string[]
 isPublic: boolean
 visibility: string
 timeLimit?: number
 memoryLimit?: number
 totalSubmit: number
 totalAccepted: number
 createdAt: string
 isAiGenerated?: boolean
 aiStatus: string
}

export default function AdminProblemsPage() {
 const router = useRouter()
 const [problems, setProblems] = useState<Problem[]>([])
 const [loading, setLoading] = useState(true)
 const [initialLoading, setInitialLoading] = useState(true)
 const [error, setError] = useState('')
 const [searchQuery, setSearchQuery] = useState('')
 const [difficultyFilter, setDifficultyFilter] = useState('all')
 const [aiStatusFilter, setAiStatusFilter] = useState('all')
 const [showDeleteModal, setShowDeleteModal] = useState(false)
 const [deletingProblem, setDeletingProblem] = useState<Problem | null>(null)
 const [showDetailModal, setShowDetailModal] = useState(false)
 const [selectedProblem, setSelectedProblem] = useState<Problem | null>(null)
 const [showFilterDropdown, setShowFilterDropdown] = useState(false)
 const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
 const filterRef = useRef<HTMLDivElement>(null)

 useEffect(() => {
 fetchProblems(true)
 }, [])

 useEffect(() => {
 const handleClickOutside = (e: MouseEvent) => {
 if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
 setShowFilterDropdown(false)
 }
 }
 document.addEventListener('mousedown', handleClickOutside)
 return () => document.removeEventListener('mousedown', handleClickOutside)
 }, [])

 const fetchProblems = useCallback(async (isInitial = false) => {
 try {
 if (isInitial) {
 setInitialLoading(true)
 } else {
 setLoading(true)
 }
 const response = await fetchWithAuth('/api/admin/problems')

 if (response.status === 403) {
 setError('需要管理员权限')
 setTimeout(() => router.push('/'), 2000)
 return
 }

 const data = await response.json()
 if (data.success) {
 setProblems(Array.isArray(data.data) ? data.data : [])
 } else {
 setError(data.error || '获取题目列表失败')
 setProblems([])
 }
 } catch (err) {
 setError('网络错误')
 } finally {
 setLoading(false)
 setInitialLoading(false)
 }
 }, [router])

 const handleToggleVisibility = async (problemId: string, currentVisibility: string) => {
 const nextVisibility = 
 currentVisibility === 'public' ? 'private' :
 currentVisibility === 'private' ? 'contest' : 'public'
 
 try {
 const response = await fetchWithAuth(`/api/admin/problems/${problemId}`, {
 method: 'PATCH',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ visibility: nextVisibility })
 })

 const data = await response.json()
 if (data.success) {
 setProblems(problems.map(p => 
 p.id === problemId 
 ? { ...p, visibility: nextVisibility, isPublic: nextVisibility === 'public' }
 : p
 ))
 } else {
 alert(data.error || '操作失败')
 }
 } catch (err) {
 alert('网络错误')
 }
 }

 const handleDeleteProblem = async () => {
 if (!deletingProblem) return

 try {
 const response = await fetchWithAuth(`/api/admin/problems/${deletingProblem.id}`, {
 method: 'DELETE'
 })

 const data = await response.json()
 if (data.success) {
 setProblems(problems.filter(p => p.id !== deletingProblem.id))
 setShowDeleteModal(false)
 setDeletingProblem(null)
 } else {
 alert(data.error || '删除失败')
 }
 } catch (err) {
 alert('网络错误')
 }
 }

 const handleBatchAction = async (action: 'publish' | 'unpublish' | 'delete' | 'contest', selectedIds: string[]) => {
 if (selectedIds.length === 0) return
 if (action === 'delete' && !confirm(`确定要删除选中的 ${selectedIds.length} 个题目吗？此操作无法撤销。`)) return

 try {
 const response = await fetchWithAuth('/api/admin/problems/batch', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 action,
 ids: selectedIds
 })
 })

 const data = await response.json()
 if (data.success) {
 fetchProblems()
 } else {
 alert('批量操作失败: ' + data.error)
 }
 } catch (err) {
 alert('网络错误')
 }
 }

 const openProblemDetail = (problem: Problem) => {
 setSelectedProblem(problem)
 setShowDetailModal(true)
 }

 const filteredProblems = problems.filter(p => {
 const matchesSearch = p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
 (p.problemNumber && p.problemNumber.toLowerCase().includes(searchQuery.toLowerCase()))
 const matchesDifficulty = difficultyFilter === 'all' || p.difficulty === difficultyFilter
 
 let matchesAi = true
 if (aiStatusFilter === 'manual') matchesAi = !p.aiStatus || p.aiStatus === 'MANUAL_CREATED' || p.aiStatus === 'NONE'
 else if (aiStatusFilter === 'assisted') matchesAi = p.aiStatus === 'AI_ASSISTED' || p.aiStatus === 'ASSISTED'
 else if (aiStatusFilter === 'generated') matchesAi = p.aiStatus === 'AI_GENERATED' || p.aiStatus === 'GENERATED'
 
 return matchesSearch && matchesDifficulty && matchesAi
 })

 const getDifficultyColor = (difficulty: string) => {
 const color = DIFFICULTY_COLORS[difficulty]
 if (color) {
 const [textColor, bgColor] = color.split(' ')
 return `tag ${bgColor.replace('/10', '/20')} ${textColor}`
 }
 return 'tag'
 }

 const getDifficultyBgClass = (difficulty: string) => {
 switch (difficulty) {
 case '简单': return 'bg-secondary/10 text-secondary-light border-secondary/30'
 case '中等': return 'bg-accent/10 text-accent-light border-accent/30'
 case '困难': return 'bg-error/10 text-error border-error/30'
 default: return 'bg-muted text-muted-foreground border-muted/30'
 }
 }

 const columns: Column<Problem>[] = [
 {
 key: 'title',
 label: '题目',
 sortable: true,
 render: (_value, problem) => (
 <div className="flex items-center gap-2">
 {problem.problemNumber && (
 <span className="font-mono text-sm font-medium text-muted-foreground">
 {problem.problemNumber}
 </span>
 )}
 <span className="text-foreground font-medium">{problem.title}</span>
 {(problem.aiStatus === 'AI_ASSISTED' || problem.aiStatus === 'ASSISTED') && (
 <span className="tag tag-info text-[10px] px-1.5 py-0.5">AI辅助</span>
 )}
 {(problem.aiStatus === 'AI_GENERATED' || problem.aiStatus === 'GENERATED') && (
 <span className="tag tag-primary text-[10px] px-1.5 py-0.5">AI出题</span>
 )}
 </div>
 ),
 },
 {
 key: 'difficulty',
 label: '难度',
 sortable: true,
 render: (value) => (
 <span className={`tag text-[10px] px-2 py-0.5 rounded-full border ${getDifficultyBgClass(value)}`}>
 {value}
 </span>
 ),
 },
 {
 key: 'tags',
 label: '标签',
 render: (value) => {
 const tags = (value as string[]) || []
 return (
 <div className="flex flex-wrap items-center gap-1">
 {tags.slice(0, 3).map((tag, idx) => (
 <span key={idx} className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded">
 {tag}
 </span>
 ))}
 {tags.length > 3 && (
 <span className="text-[10px] text-muted-foreground">+{tags.length - 3}</span>
 )}
 </div>
 )
 },
 },
 {
 key: 'visibility',
 label: '状态',
 render: (value, problem) => {
 const isPublic = value === 'public' || (!value && problem.isPublic)
 if (isPublic) return <span className="tag tag-success">公开</span>
 if (value === 'contest') return <span className="tag tag-info">竞赛</span>
 return <span className="tag">隐藏</span>
 },
 },
 {
 key: 'aiStatus',
 label: '来源',
 render: (value) => {
 if (value === 'AI_ASSISTED' || value === 'ASSISTED') return <span className="tag tag-info">AI辅助</span>
 if (value === 'AI_GENERATED' || value === 'GENERATED') return <span className="tag tag-primary">AI出题</span>
 return <span className="text-muted-foreground">人工</span>
 },
 },
 {
 key: 'createdAt',
 label: '创建时间',
 sortable: true,
 render: (value) => (
 <span className="text-sm text-muted-foreground">
 {new Date(value).toLocaleDateString('zh-CN')}
 </span>
 ),
 },
 {
 key: 'id' as keyof Problem,
 label: '操作',
 render: (_value, problem) => (
 <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
 <button
 onClick={(e) => {
 e.stopPropagation()
 handleToggleVisibility(problem.id, problem.visibility || (problem.isPublic ? 'public' : 'private'))
 }}
 className={`p-2 rounded-lg transition-colors ${
 problem.visibility === 'public' || (!problem.visibility && problem.isPublic)
 ? 'text-secondary-light hover:bg-secondary/10'
 : problem.visibility === 'contest'
 ? 'text-accent-light hover:bg-accent/10'
 : 'text-muted-foreground hover:bg-muted'
 }`}
 title="切换可见性"
 >
 {problem.visibility === 'public' || (!problem.visibility && problem.isPublic) ? (
 <Eye className="w-4 h-4" />
 ) : problem.visibility === 'contest' ? (
 <Trophy className="w-4 h-4" />
 ) : (
 <EyeOff className="w-4 h-4" />
 )}
 </button>
 <button
 onClick={(e) => {
 e.stopPropagation()
 router.push(`/admin/problems/${problem.id}/testcases`)
 }}
 className="p-2 text-primary hover:bg-primary/5 rounded-lg transition-colors"
 title="测试数据"
 >
 <Database className="w-4 h-4" />
 </button>
 <button
 onClick={(e) => {
 e.stopPropagation()
 router.push(`/admin/problems/${problem.id}/edit`)
 }}
 className="p-2 text-primary hover:bg-primary/5 rounded-lg transition-colors"
 title="编辑"
 >
 <Edit className="w-4 h-4" />
 </button>
 <button
 onClick={(e) => {
 e.stopPropagation()
 setDeletingProblem(problem)
 setShowDeleteModal(true)
 }}
 className="p-2 text-error hover:bg-error/10 rounded-lg transition-colors"
 title="删除"
 >
 <Trash2 className="w-4 h-4" />
 </button>
 </div>
 ),
 },
 ]

 const batchActions = [
 { label: '公开', action: (ids: string[]) => handleBatchAction('publish', ids) },
 { label: '竞赛', action: (ids: string[]) => handleBatchAction('contest', ids) },
 { label: '隐藏', action: (ids: string[]) => handleBatchAction('unpublish', ids) },
 { label: '删除', action: (ids: string[]) => handleBatchAction('delete', ids), danger: true },
 ]

 if (initialLoading) {
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

 if (error) {
 return (
 <AdminLayout>
 <div className="flex items-center justify-center min-h-screen">
 <div className="text-center">
 <p className="text-error text-lg mb-2">{error}</p>
 {error.includes('权限') && <p className="text-muted-foreground">正在跳转...</p>}
 </div>
 </div>
 </AdminLayout>
 )
 }

 return (
 <AdminLayout>
 <div className="space-y-6">
 <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-xl flex items-center justify-center"
 style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)' }}>
 <FileText className="w-5 h-5 text-white" />
 </div>
 <div>
 <h1 className="text-2xl font-bold text-foreground">题目管理</h1>
 <p className="text-sm text-muted-foreground">管理和编辑题目库</p>
 </div>
 </div>
 <div className="flex gap-3">
 <button
 onClick={() => router.push('/admin/problems/source')}
 className="btn btn-ghost flex items-center gap-2"
 >
 <Database className="w-5 h-5" />
 来源管理
 </button>
 <button
 onClick={() => router.push('/admin/problems/create')}
 className="btn btn-primary flex items-center gap-2"
 >
 <Plus className="w-5 h-5" />
 创建题目
 </button>
 </div>
 </div>

 <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
 <div className="card p-4">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-lg bg-primary/5 flex items-center justify-center">
 <FileText className="w-5 h-5 text-primary" />
 </div>
 <div>
 <div className="text-muted-foreground text-xs">总题目数</div>
 <div className="text-xl font-bold text-foreground">{problems.length}</div>
 </div>
 </div>
 </div>
 <div className="card p-4">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-lg bg-secondary/100/10 flex items-center justify-center">
 <Eye className="w-5 h-5 text-secondary-light" />
 </div>
 <div>
 <div className="text-muted-foreground text-xs">公开题目</div>
 <div className="text-xl font-bold text-secondary-light">{problems.filter(p => p.isPublic).length}</div>
 </div>
 </div>
 </div>
 <div className="card p-4">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-lg bg-accent/100/10 flex items-center justify-center">
 <Trophy className="w-5 h-5 text-accent-light" />
 </div>
 <div>
 <div className="text-muted-foreground text-xs">竞赛题目</div>
 <div className="text-xl font-bold text-accent-light">{problems.filter(p => p.visibility === 'contest').length}</div>
 </div>
 </div>
 </div>
 <div className="card p-4">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-lg bg-muted0/10 flex items-center justify-center">
 <EyeOff className="w-5 h-5 text-muted-foreground" />
 </div>
 <div>
 <div className="text-muted-foreground text-xs">隐藏题目</div>
 <div className="text-xl font-bold text-muted-foreground">{problems.filter(p => !p.isPublic && p.visibility !== 'contest').length}</div>
 </div>
 </div>
 </div>
 </div>

 <div className="card p-4 overflow-visible relative z-30">
 <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
 <div className="flex-1 min-w-[200px]">
 <div className="relative">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
 <input
 type="text"
 placeholder="搜索题目编号或标题..."
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 className="input pl-10 py-2.5 text-sm"
 />
 </div>
 </div>
 
 <div className="flex gap-2 flex-wrap">
 <div className="flex gap-1 p-1 rounded-lg bg-muted">
 {[
 { id: 'all', label: '全部' },
 { id: 'manual', label: '人工' },
 { id: 'assisted', label: 'AI辅助' },
 { id: 'generated', label: 'AI出题' }
 ].map(tab => (
 <button 
 key={tab.id}
 onClick={() => setAiStatusFilter(tab.id)}
 className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
 aiStatusFilter === tab.id 
 ? 'bg-primary text-foreground' 
 : 'text-muted-foreground hover:text-foreground hover:bg-muted'
 }`}
 >
 {tab.label}
 </button>
 ))}
 </div>

 <div className="relative" ref={filterRef}>
 <button
 onClick={() => setShowFilterDropdown(!showFilterDropdown)}
 className={`btn btn-ghost text-sm flex items-center gap-2 ${difficultyFilter !== 'all' ? 'text-primary' : ''}`}
 >
 <Filter className="w-4 h-4" />
 难度
 {difficultyFilter !== 'all' && (
 <span className="w-5 h-5 rounded-full bg-primary/5 text-xs flex items-center justify-center">
 1
 </span>
 )}
 <ChevronDown className={`w-4 h-4 transition-transform ${showFilterDropdown ? 'rotate-180' : ''}`} />
 </button>
 
 {showFilterDropdown && (
 <div className="absolute top-full right-0 mt-2 w-40 card p-2 z-50 shadow-xl border border-slate-200">
 <div className="space-y-1">
 <button
 onClick={() => { setDifficultyFilter('all'); setShowFilterDropdown(false); }}
 className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
 difficultyFilter === 'all' ? 'bg-primary/5 text-primary' : 'text-muted-foreground hover:bg-muted'
 }`}
 >
 全部难度
 </button>
 {DIFFICULTIES.map(diff => (
 <button
 key={diff}
 onClick={() => { setDifficultyFilter(diff); setShowFilterDropdown(false); }}
 className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
 difficultyFilter === diff ? 'bg-primary/5 text-primary' : 'text-muted-foreground hover:bg-muted'
 }`}
 >
 <span className={`inline-block w-2 h-2 rounded-full mr-2 ${
 diff === '入门' || diff === '普及-' ? 'bg-secondary' : 
 diff === '普及' || diff === '普及+' ? 'bg-blue-400' : 
 diff === '提高' || diff === '提高+' ? 'bg-accent' : 
 diff === '省选' ? 'bg-accent' : 'bg-error'
 }`}></span>
 {diff}
 </button>
 ))}
 </div>
 </div>
 )}
 </div>
 </div>
 </div>

 </div>

 <DataTable<Problem>
 data={filteredProblems}
 columns={columns}
 idKey="id"
 loading={loading}
 emptyMessage={searchQuery || difficultyFilter !== 'all' || aiStatusFilter !== 'all'
 ? '没有找到匹配的题目'
 : '暂无题目，点击"创建题目"添加第一道题目'}
 batchActions={batchActions}
 onRowClick={(row) => router.push(`/admin/problems/${row.id}`)}
 />
 </div>

 {showDetailModal && selectedProblem && (
 <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowDetailModal(false)}>
 <div className="card max-w-2xl w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
 <div className="flex items-center justify-between p-4 border-b border-slate-200 flex-shrink-0">
 <div className="flex items-center gap-3">
 {selectedProblem.problemNumber && (
 <span className="font-mono text-sm font-medium text-muted-foreground">
 {selectedProblem.problemNumber}
 </span>
 )}
 <h3 className="text-lg font-bold text-foreground">{selectedProblem.title}</h3>
 </div>
 <button
 onClick={() => setShowDetailModal(false)}
 className="p-1 text-muted-foreground hover:text-foreground transition-colors"
 >
 <X className="w-5 h-5" />
 </button>
 </div>

 <div className="p-4 overflow-y-auto flex-1 custom-scrollbar">
 <div className="flex flex-wrap gap-2 mb-4">
 <span className={`tag text-xs px-3 py-1 rounded-full border ${getDifficultyBgClass(selectedProblem.difficulty)}`}>
 {selectedProblem.difficulty}
 </span>
 {selectedProblem.tags.map((tag, idx) => (
 <span key={idx} className="tag text-xs">{tag}</span>
 ))}
 </div>

 <div className="grid grid-cols-3 gap-4 mb-6">
 <div className="bg-muted rounded-lg p-3 text-center">
 <div className="text-xs text-muted-foreground mb-1">提交次数</div>
 <div className="text-xl font-bold text-foreground">{selectedProblem.totalSubmit}</div>
 </div>
 <div className="bg-muted rounded-lg p-3 text-center">
 <div className="text-xs text-muted-foreground mb-1">通过次数</div>
 <div className="text-xl font-bold text-secondary-light">{selectedProblem.totalAccepted}</div>
 </div>
 <div className="bg-muted rounded-lg p-3 text-center">
 <div className="text-xs text-muted-foreground mb-1">通过率</div>
 <div className="text-xl font-bold text-primary">
 {selectedProblem.totalSubmit > 0 
 ? ((selectedProblem.totalAccepted / selectedProblem.totalSubmit) * 100).toFixed(1)
 : 0}%
 </div>
 </div>
 </div>

 {selectedProblem.description && (
 <div className="mb-6">
 <div className="text-xs text-muted-foreground mb-2 font-medium">题目描述</div>
 <div className="bg-muted rounded-lg p-4 text-sm text-muted-foreground whitespace-pre-wrap max-h-40 overflow-y-auto custom-scrollbar">
 {selectedProblem.description}
 </div>
 </div>
 )}

 {selectedProblem.input && (
 <div className="mb-4">
 <div className="text-xs text-muted-foreground mb-2 font-medium">输入格式</div>
 <div className="bg-muted rounded-lg p-4 text-sm text-muted-foreground whitespace-pre-wrap max-h-32 overflow-y-auto custom-scrollbar">
 {selectedProblem.input}
 </div>
 </div>
 )}

 {selectedProblem.output && (
 <div className="mb-4">
 <div className="text-xs text-muted-foreground mb-2 font-medium">输出格式</div>
 <div className="bg-muted rounded-lg p-4 text-sm text-muted-foreground whitespace-pre-wrap max-h-32 overflow-y-auto custom-scrollbar">
 {selectedProblem.output}
 </div>
 </div>
 )}

 {selectedProblem.samples && selectedProblem.samples.length > 0 && (
 <div className="mb-4">
 <div className="text-xs text-muted-foreground mb-2 font-medium">样例</div>
 <div className="space-y-2">
 {selectedProblem.samples.map((sample, idx) => (
 <div key={idx} className="grid grid-cols-2 gap-2">
 <div className="bg-muted rounded-lg p-3">
 <div className="text-[10px] text-muted-foreground mb-1">输入样例 {idx + 1}</div>
 <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">{sample.input}</pre>
 </div>
 <div className="bg-muted rounded-lg p-3">
 <div className="text-[10px] text-muted-foreground mb-1">输出样例 {idx + 1}</div>
 <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">{sample.output}</pre>
 </div>
 </div>
 ))}
 </div>
 </div>
 )}

 {selectedProblem.hint && (
 <div className="mb-4">
 <div className="text-xs text-muted-foreground mb-2 font-medium">提示</div>
 <div className="bg-accent/100/10 border border-amber-500/20 rounded-lg p-4 text-sm text-accent-light whitespace-pre-wrap max-h-32 overflow-y-auto custom-scrollbar">
 {selectedProblem.hint}
 </div>
 </div>
 )}

 <div className="grid grid-cols-2 gap-4 mb-4">
 <div>
 <div className="text-xs text-muted-foreground mb-2 flex items-center gap-2">
 <Clock className="w-3 h-3" />
 时间限制
 </div>
 <div className="text-sm text-foreground">{selectedProblem.timeLimit || 1000} ms</div>
 </div>
 <div>
 <div className="text-xs text-muted-foreground mb-2 flex items-center gap-2">
 <Database className="w-3 h-3" />
 内存限制
 </div>
 <div className="text-sm text-foreground">{selectedProblem.memoryLimit || 256} MB</div>
 </div>
 </div>

 {(selectedProblem.isAiGenerated) && (
 <div className="mb-4 p-4 rounded-lg border border-primary/20 bg-primary/5">
 <div className="flex items-center gap-2 mb-3">
 <FileText className="w-4 h-4 text-primary" />
 <span className="text-sm font-semibold text-foreground">AI 生成信息</span>
 </div>

 <div className="grid grid-cols-2 gap-3 text-xs">
 <div>
 <div className="text-muted-foreground mb-1">AI 状态</div>
 <div>
 {selectedProblem.aiStatus === 'DRAFT' && (
 <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-slate-200">
 草稿
 </span>
 )}
 {selectedProblem.aiStatus === 'FORCE_PUBLISHED' && (
 <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-300 border border-yellow-500/20">
 强制公开
 </span>
 )}
 {!['DRAFT', 'FORCE_PUBLISHED'].includes(selectedProblem.aiStatus) && (
 <span className="text-foreground">{selectedProblem.aiStatus || '-'}</span>
 )}
 </div>
 </div>
 </div>
 </div>
 )}

 {selectedProblem.source && (
 <div className="mb-4">
 <div className="text-xs text-muted-foreground mb-2">来源</div>
 <div className="text-sm text-muted-foreground">{selectedProblem.source}</div>
 </div>
 )}

 <div className="flex items-center gap-4">
 <div>
 <div className="text-xs text-muted-foreground mb-2 flex items-center gap-2">
 <BarChart2 className="w-3 h-3" />
 可见性
 </div>
 <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium ${
 selectedProblem.visibility === 'public' || (!selectedProblem.visibility && selectedProblem.isPublic)
 ? 'bg-secondary/10 text-secondary-light'
 : selectedProblem.visibility === 'contest'
 ? 'bg-accent/10 text-accent-light'
 : 'bg-muted text-muted-foreground'
 }`}>
 {selectedProblem.visibility === 'public' || (!selectedProblem.visibility && selectedProblem.isPublic) ? (
 <>
 <Eye className="w-3 h-3" />
 公开
 </>
 ) : selectedProblem.visibility === 'contest' ? (
 <>
 <Trophy className="w-3 h-3" />
 竞赛
 </>
 ) : (
 <>
 <EyeOff className="w-3 h-3" />
 隐藏
 </>
 )}
 </span>
 </div>
 <div>
 <div className="text-xs text-muted-foreground mb-2 flex items-center gap-2">
 <Clock className="w-3 h-3" />
 创建时间
 </div>
 <div className="text-sm text-foreground">
 {new Date(selectedProblem.createdAt).toLocaleString('zh-CN')}
 </div>
 </div>
 </div>
 </div>

 <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-200 flex-shrink-0">
 <button
 onClick={() => {
 setShowDetailModal(false)
 router.push(`/admin/problems/${selectedProblem.id}/testcases`)
 }}
 className="btn btn-ghost text-sm"
 >
 <Database className="w-4 h-4" />
 测试数据
 </button>
 <button
 onClick={() => {
 setShowDetailModal(false)
 router.push(`/admin/problems/${selectedProblem.id}/edit`)
 }}
 className="btn btn-primary text-sm"
 >
 <Edit className="w-4 h-4" />
 编辑题目
 </button>
 </div>
 </div>
 </div>
 )}

 {showDeleteModal && deletingProblem && (
 <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowDeleteModal(false)}>
 <div className="card p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
 <h3 className="text-lg font-bold text-foreground mb-4">确认删除</h3>
 <p className="text-muted-foreground mb-6">
 确定要删除题目 <span className="text-foreground font-medium">{deletingProblem.title}</span> 吗？
 此操作无法撤销。
 </p>
 <div className="flex gap-3 justify-end">
 <button
 onClick={() => {
 setShowDeleteModal(false)
 setDeletingProblem(null)
 }}
 className="btn btn-ghost"
 >
 取消
 </button>
 <button
 onClick={handleDeleteProblem}
 className="btn btn-destructive"
 >
 确认删除
 </button>
 </div>
 </div>
 </div>
 )}
 </AdminLayout>
 )
}
