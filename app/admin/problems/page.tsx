'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { DataTable, FilterBar, type Column } from '@/components/admin'
import { fetchWithAuth } from '@/lib/api/base'
import { FileText, Plus, Edit, Trash2, Eye, EyeOff, Search, Trophy, Database, Loader2, History, ChevronDown, Check } from 'lucide-react'
import { DIFFICULTIES } from '@/lib/constants'
import { getDifficultyColor } from '@/lib/status'
import { formatDate, formatDateTime } from '@/lib/utils'

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

interface LogEntry {
 id: string
 userId: string | null
 action: string
 resource?: string
 details?: {
   count?: number
   targetSource?: string
   [key: string]: unknown
 } | null
 ip?: string | null
 userAgent?: string | null
 createdAt: string
}

type ActiveTab = 'list' | 'logs'

export default function AdminProblemsPage() {
 const router = useRouter()
 const [problems, setProblems] = useState<Problem[]>([])
 const [loading, setLoading] = useState(true)
 const [initialLoading, setInitialLoading] = useState(true)
 const [error, setError] = useState('')
 const [searchQuery, setSearchQuery] = useState('')
 const [difficultyFilter, setDifficultyFilter] = useState<string>('all')
 const [difficultyOpen, setDifficultyOpen] = useState(false)
 const [aiStatusFilter, setAiStatusFilter] = useState('all')
 const [showDeleteModal, setShowDeleteModal] = useState(false)
 const [deletingProblem, setDeletingProblem] = useState<Problem | null>(null)
 const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
 const [showBatchSourceModal, setShowBatchSourceModal] = useState(false)
 const [batchSourceIds, setBatchSourceIds] = useState<string[]>([])
 const [targetSource, setTargetSource] = useState<'MANUAL_CREATED' | 'AI_ASSISTED' | 'AI_GENERATED'>('MANUAL_CREATED')
 const [batchSourceProcessing, setBatchSourceProcessing] = useState(false)
 const [activeTab, setActiveTab] = useState<ActiveTab>('list')
 const [logs, setLogs] = useState<LogEntry[]>([])
 const [logsLoading, setLogsLoading] = useState(false)
 const difficultyRef = useRef<HTMLDivElement>(null)

 useEffect(() => {
 const handleClickOutside = (e: MouseEvent) => {
 if (difficultyRef.current && !difficultyRef.current.contains(e.target as Node)) {
 setDifficultyOpen(false)
 }
 }
 document.addEventListener('mousedown', handleClickOutside)
 return () => document.removeEventListener('mousedown', handleClickOutside)
 }, [])

 useEffect(() => {
 fetchProblems(true)
 }, [])

 useEffect(() => {
 if (activeTab === 'logs') {
   fetchLogs()
 }
 }, [activeTab])

 const fetchLogs = useCallback(async () => {
 setLogsLoading(true)
 try {
   const res = await fetchWithAuth('/api/admin/logs/source-changes')
   const data = await res.json()
   if (data.success) {
     setLogs(Array.isArray(data.data) ? data.data : [])
   }
 } catch (err) {
   console.error('获取来源变更日志失败', err)
 } finally {
   setLogsLoading(false)
 }
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
 setTimeout(() => router.push('/403'), 2000)
 return
 }

 const data = await response.json()
 if (data.success) {
   const payload = data.data
   setProblems(Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [])
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

 const handleBatchUpdateSource = async () => {
 if (batchSourceIds.length === 0) return
 setBatchSourceProcessing(true)
 try {
 const response = await fetchWithAuth('/api/admin/problems/batch-source', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 ids: batchSourceIds,
 source: targetSource
 })
 })
 const data = await response.json()
 if (data.success) {
 alert(data.message)
 setShowBatchSourceModal(false)
 setBatchSourceIds([])
 fetchProblems()
 } else {
 alert(data.error || '批量修改来源失败')
 }
 } catch (err) {
 alert('网络错误')
 } finally {
 setBatchSourceProcessing(false)
 }
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

 const difficultyLabel = difficultyFilter === 'all' ? '全部难度' : difficultyFilter

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
 <span className={`difficulty-tag ${getDifficultyColor(value)}`}>
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
 {formatDate(value)}
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
 className={`p-2.5 rounded-lg transition-colors ${
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
 className="p-2.5 text-primary hover:bg-primary/5 rounded-lg transition-colors"
 title="测试数据"
 >
 <Database className="w-4 h-4" />
 </button>
 <button
 onClick={(e) => {
 e.stopPropagation()
 router.push(`/admin/problems/${problem.id}/edit`)
 }}
 className="p-2.5 text-primary hover:bg-primary/5 rounded-lg transition-colors"
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
 className="p-2.5 text-error hover:bg-error/10 rounded-lg transition-colors"
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
 { label: '改来源', action: (ids: string[]) => {
 setBatchSourceIds(ids)
 setTargetSource('MANUAL_CREATED')
 setShowBatchSourceModal(true)
 }},
 { label: '删除', action: (ids: string[]) => handleBatchAction('delete', ids), danger: true },
 ]

 const logColumns: Column<LogEntry>[] = [
 {
 key: 'createdAt',
 label: '时间',
 render: (value) => (
 <span className="text-sm text-muted-foreground">
 {formatDateTime(value)}
 </span>
 ),
 },
 {
 key: 'userId',
 label: '操作人',
 render: (value) => (
 <span className="text-sm text-foreground font-medium">
 {value || 'System'}
 </span>
 ),
 },
 {
 key: 'action',
 label: '动作',
 render: (value) => <span className="tag">{value}</span>,
 },
 {
 key: 'details',
 label: '详情',
 render: (value) => value ? (
 <div className="space-y-1 text-sm text-muted-foreground">
 {value.count !== undefined && <div>数量: {value.count}</div>}
 {value.targetSource && (
 <div>
 目标来源: <span className="font-mono text-xs">{value.targetSource}</span>
 </div>
 )}
 </div>
 ) : (
 <span className="text-muted-foreground">-</span>
 ),
 },
 {
 key: 'ip',
 label: 'IP',
 render: (value) => (
 <span className="text-sm text-muted-foreground font-mono text-xs">{value}</span>
 ),
 },
 ]

 if (initialLoading) {
 return (
 <div className="flex items-center justify-center min-h-screen">
 <div className="text-center">
 <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
 <p className="text-muted-foreground">加载中...</p>
 </div>
 </div>
 )
 }

 if (error) {
 return (
 <div className="flex items-center justify-center min-h-screen">
 <div className="text-center">
 <p className="text-error text-lg mb-2">{error}</p>
 {error.includes('权限') && <p className="text-muted-foreground">正在跳转...</p>}
 </div>
 </div>
 )
 }

 return (
 <>
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
 onClick={() => router.push('/admin/problems/create')}
 className="btn btn-primary flex items-center gap-2"
 >
 <Plus className="w-5 h-5" />
 创建题目
 </button>
 </div>
 </div>

 <div className="flex gap-1 p-1 rounded-lg bg-muted w-fit">
 <button
 onClick={() => setActiveTab('list')}
 className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
 activeTab === 'list' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
 }`}
 >
 题目列表
 </button>
 <button
 onClick={() => setActiveTab('logs')}
 className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
 activeTab === 'logs' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
 }`}
 >
 来源日志
 </button>
 </div>

 {activeTab === 'list' && (
 <>
 {/* 筛选栏：搜索 + AI来源 + 难度下拉 */}
 <FilterBar activeCount={(searchQuery ? 1 : 0) + (difficultyFilter !== 'all' ? 1 : 0) + (aiStatusFilter !== 'all' ? 1 : 0)}>
 <div className="flex-1 min-w-[200px]">
 <div className="relative">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
 <input
 type="text"
 placeholder="搜索题目编号或标题..."
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 className="input pl-9 py-2 text-sm"
 />
 </div>
 </div>

 <div className="flex gap-2 flex-wrap items-center">
 {/* AI 来源筛选 */}
 <div className="flex gap-0.5 p-0.5 rounded-lg bg-muted">
 {[
 { id: 'all', label: '全部' },
 { id: 'manual', label: '人工' },
 { id: 'assisted', label: 'AI辅助' },
 { id: 'generated', label: 'AI出题' }
 ].map(tab => (
 <button
 key={tab.id}
 onClick={() => setAiStatusFilter(tab.id)}
 className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
 aiStatusFilter === tab.id
 ? 'bg-primary text-white'
 : 'text-muted-foreground hover:text-foreground hover:bg-muted'
 }`}
 >
 {tab.label}
 </button>
 ))}
 </div>

 {/* 难度筛选：下拉单选，全站统一 8 级体系 */}
 <div className="relative" ref={difficultyRef}>
 <button
 type="button"
 onClick={() => setDifficultyOpen(o => !o)}
 className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-border bg-background hover:bg-muted transition-colors max-w-[9rem] truncate ${
 difficultyFilter !== 'all' ? 'border-primary/40 text-primary' : 'text-foreground'
 }`}
 >
 <span className="truncate">{difficultyLabel}</span>
 <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${difficultyOpen ? 'rotate-180' : ''}`} />
 </button>
 {difficultyOpen && (
 <div className="absolute right-0 z-[60] mt-1 w-44 max-w-[calc(100vw-2rem)] max-h-72 overflow-y-auto rounded-lg border border-border bg-background shadow-lg py-1">
 <button
 type="button"
 onClick={() => { setDifficultyFilter('all'); setDifficultyOpen(false) }}
 className={`w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2 ${
 difficultyFilter === 'all' ? 'text-primary font-medium' : 'text-muted-foreground'
 }`}
 >
 {difficultyFilter === 'all' && <Check className="w-4 h-4" />}
 <span className={difficultyFilter === 'all' ? '' : 'ml-6'}>全部难度</span>
 </button>
 {DIFFICULTIES.map(d => {
 const selected = difficultyFilter === d
 return (
 <button
 key={d}
 type="button"
 onClick={() => { setDifficultyFilter(d); setDifficultyOpen(false) }}
 className={`w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2 ${
 selected ? 'text-primary font-medium' : 'text-muted-foreground'
 }`}
 >
 {selected && <Check className="w-4 h-4" />}
 <span className={`difficulty-tag ${getDifficultyColor(d)} ${selected ? 'ml-0' : 'ml-6'}`}>{d}</span>
 </button>
 )
 })}
 </div>
 )}
 </div>
 </div>
 </FilterBar>

 {/* 统计行：紧凑内联统计 */}
 <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm px-1">
 <span className="text-muted-foreground">共 <span className="text-lg font-bold text-foreground">{problems.length}</span> 题</span>
 <span className="text-border">|</span>
 <span className="text-secondary-light">公开 {problems.filter(p => p.isPublic).length}</span>
 <span className="text-accent-light">竞赛 {problems.filter(p => p.visibility === 'contest').length}</span>
 <span className="text-muted-foreground">隐藏 {problems.filter(p => !p.isPublic && p.visibility !== 'contest').length}</span>
 {filteredProblems.length !== problems.length && (
 <>
 <span className="text-border">|</span>
 <span className="text-primary">筛选后 {filteredProblems.length} 题</span>
 </>
 )}
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
 onRowClick={(row) => router.push(`/admin/problems/${row.id}/edit`)}
 />
 </>
 )}
 {activeTab === 'logs' && (
 <div className="space-y-4">
 <div className="flex justify-between items-center">
 <h3 className="font-bold text-foreground flex items-center gap-2">
 <History className="w-5 h-5 text-muted-foreground" />
 最近变更记录
 </h3>
 <button onClick={fetchLogs} className="text-sm text-primary-light hover:text-foreground">刷新</button>
 </div>
 <DataTable<LogEntry>
 data={logs}
 columns={logColumns}
 idKey="id"
 loading={logsLoading}
 emptyMessage="暂无变更记录"
 />
 </div>
 )}
 </div>

 {showDeleteModal && deletingProblem && (
 <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[110] p-4" onClick={() => setShowDeleteModal(false)}>
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

 {showBatchSourceModal && (
 <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110]">
 <div className="card p-6 max-w-md w-full mx-4">
 <h3 className="text-lg font-bold text-foreground mb-4">批量修改来源标记</h3>
 <p className="text-muted-foreground mb-4 text-sm">正在修改 <span className="text-foreground font-bold">{batchSourceIds.length}</span> 个题目的来源属性。</p>

 <div className="space-y-3">
 {(['MANUAL_CREATED', 'AI_ASSISTED', 'AI_GENERATED'] as const).map(opt => (
 <label key={opt} className="flex items-center gap-3 p-3 rounded-lg border border-border cursor-pointer hover:bg-muted transition-colors">
 <input
 type="radio"
 name="source"
 value={opt}
 checked={targetSource === opt}
 onChange={(e) => setTargetSource(e.target.value as 'MANUAL_CREATED' | 'AI_ASSISTED' | 'AI_GENERATED')}
 className="text-primary focus:ring-primary/50"
 />
 <span className="font-medium text-foreground">{opt}</span>
 </label>
 ))}
 </div>

 <div className="mt-6 flex justify-end gap-3">
 <button onClick={() => setShowBatchSourceModal(false)} className="btn btn-ghost">取消</button>
 <button
 onClick={handleBatchUpdateSource}
 disabled={batchSourceProcessing}
 className="btn btn-primary flex items-center gap-2"
 >
 {batchSourceProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
 {batchSourceProcessing ? '处理中...' : '确认修改'}
 </button>
 </div>
 </div>
 </div>
 )}
 </>
 )
}