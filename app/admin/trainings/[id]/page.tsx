'use client'

/**
 * app/admin/trainings/[id]/page.tsx
 * 管理后台 - 编辑题单（题目增删改排序 + 题单属性）
 */
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import AdminLayout from '@/components/AdminLayout'
import {
 ArrowLeft, Save, X, Plus, Trash2, Check, AlertCircle, RefreshCw,
 Search, ExternalLink, ChevronUp, ChevronDown
} from 'lucide-react'
import toast from 'react-hot-toast'
import { fetchWithCookie } from '@/lib/api/base'

interface TrainingProblem {
 id: string
 problemId: string
 orderIndex: number
 score: number
 required: boolean
 problem: { id: string; title: string; difficulty: string; problemNumber?: string | null }
}

interface TrainingDetail {
 id: string
 title: string
 description: string
 difficulty: string | null
 categoryType: 'official' | 'contest' | null
 isPublic: boolean
 status: string
 isRecommended: boolean
 tags: string[]
 cover: string | null
 problems: TrainingProblem[]
}

interface ProblemListItem {
 id: string
 title: string
 difficulty: string
 problemNumber?: string | null
}

const difficultyClass = (d: string) => {
 if (d?.includes('入门')) return 'bg-success/15 text-success border-success/30'
 if (d?.includes('普及')) return 'bg-warning/15 text-warning border-warning/30'
 if (d?.includes('提高') || d?.includes('省选') || d?.includes('NOI')) return 'bg-error/15 text-error border-error/30'
 return 'bg-primary/15 text-primary-light border-primary/30'
}

export default function EditTrainingPage() {
 const params = useParams<{ id: string }>()
 const router = useRouter()
 const id = params?.id || ''

 const [training, setTraining] = useState<TrainingDetail | null>(null)
 const [loading, setLoading] = useState(true)
 const [error, setError] = useState<string | null>(null)

 // 表单字段
 const [title, setTitle] = useState('')
 const [description, setDescription] = useState('')
 const [categoryType, setCategoryType] = useState<'' | 'official' | 'contest'>('')
 const [isPublic, setIsPublic] = useState(true)
 const [status, setStatus] = useState('published')
 const [isRecommended, setIsRecommended] = useState(false)
 const [cover, setCover] = useState('')
 const [tags, setTags] = useState<string[]>([])
 const [tagInput, setTagInput] = useState('')

 // 题目批量编辑（local state，dirty 跟踪未保存改动）
 const [localScores, setLocalScores] = useState<Record<string, number>>({})
 const [localRequired, setLocalRequired] = useState<Record<string, boolean>>({})
 const [dirty, setDirty] = useState<Set<string>>(new Set())
 const [savingProblems, setSavingProblems] = useState(false)

 // 题目添加搜索
 const [searchOpen, setSearchOpen] = useState(false)
 const [searchKw, setSearchKw] = useState('')
 const [searchResults, setSearchResults] = useState<ProblemListItem[]>([])

 const [saving, setSaving] = useState(false)

 const fetchDetail = useCallback(async () => {
 try {
 setLoading(true)
 const res = await fetchWithCookie(`/api/trainings/${id}`, { cache: 'no-store' })
 const data = await res.json()
 if (data.success) {
 const t = data.data as TrainingDetail
 setTraining(t)
 setTitle(t.title)
 setDescription(t.description)
 setCategoryType((t.categoryType as '' | 'official' | 'contest') || '')
 setIsPublic(t.isPublic)
 setStatus(t.status)
 setIsRecommended(t.isRecommended)
 setCover(t.cover || '')
 setTags(t.tags || [])
 // 初始化 local 题目状态
 const scores: Record<string, number> = {}
 const reqs: Record<string, boolean> = {}
 t.problems.forEach(p => {
 scores[p.problemId] = p.score
 reqs[p.problemId] = p.required
 })
 setLocalScores(scores)
 setLocalRequired(reqs)
 setDirty(new Set())
 } else {
 setError(data.error || '加载失败')
 }
 } catch {
 setError('网络错误')
 } finally {
 setLoading(false)
 }
 }, [id])

 useEffect(() => { fetchDetail() }, [fetchDetail])

 // 搜索题目
 useEffect(() => {
 if (!searchOpen) return
 const t = setTimeout(() => {
 const params = new URLSearchParams({ limit: '50' })
 if (searchKw) params.set('keyword', searchKw)
 fetchWithCookie(`/api/problems?${params}`, { cache: 'no-store' })
 .then(r => r.json())
 .then(data => {
 const items = Array.isArray(data?.data?.items) ? data.data.items
 : Array.isArray(data?.data) ? data.data : []
 const inList = new Set(training?.problems.map(p => p.problemId) || [])
 setSearchResults(items.filter((p: ProblemListItem) => !inList.has(p.id)))
 })
 .catch(() => setSearchResults([]))
 }, 300)
 return () => clearTimeout(t)
 }, [searchKw, searchOpen, training])

 const saveMeta = async () => {
 if (!title || !description || !categoryType) {
 toast.error('请填写标题、描述、分类')
 return
 }
 setSaving(true)
 try {
 const res = await fetchWithCookie(`/api/trainings/${id}`, {
 method: 'PUT',
 cache: 'no-store',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 title,
 description,
 categoryType: categoryType || null,
 isPublic,
 status,
 isRecommended,
 tags,
 cover: cover || null,
 }),
 })
 const data = await res.json()
 if (data.success) {
 toast.success('保存成功')
 fetchDetail()
 } else {
 toast.error(data.error || '保存失败')
 }
 } catch {
 toast.error('网络错误')
 } finally {
 setSaving(false)
 }
 }

 // 题目操作（不自动 fetchDetail，由调用者决定是否刷新）
 const patchProblems = async (payload: any) => {
 try {
 const res = await fetchWithCookie(`/api/trainings/${id}/problems`, {
 method: 'PATCH',
 cache: 'no-store',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(payload),
 })
 const data = await res.json()
 if (data.success) {
 return true
 } else {
 toast.error(data.error || '操作失败')
 return false
 }
 } catch {
 toast.error('网络错误')
 return false
 }
 }

 const handleAddProblems = async (problemIds: string[]) => {
 if (problemIds.length === 0) return
 const ok = await patchProblems({
 action: 'add',
 problems: problemIds.map(p => ({ problemId: p })),
 })
 if (ok) await fetchDetail()
 }

 const handleRemove = async (problemId: string) => {
 if (!confirm('确定从题单中移除该题目？')) return
 const ok = await patchProblems({ action: 'remove', problemIds: [problemId] })
 if (ok) await fetchDetail()
 }

 const handleMove = async (problemId: string, direction: -1 | 1) => {
 if (!training) return
 const sorted = [...training.problems].sort((a, b) => a.orderIndex - b.orderIndex)
 const idx = sorted.findIndex(p => p.problemId === problemId)
 const target = idx + direction
 if (target < 0 || target >= sorted.length) return

 // 乐观更新：交换位置后重新计算 orderIndex
 const swapped = [...sorted]
 ;[swapped[idx], swapped[target]] = [swapped[target], swapped[idx]]
 const newSorted = swapped.map((p, i) => ({ ...p, orderIndex: i }))
 setTraining(t => t ? { ...t, problems: newSorted } : t)

 // 后端提交（失败时回滚）
 const orderMap = newSorted.map((p, i) => ({ problemId: p.problemId, orderIndex: i }))
 const ok = await patchProblems({ action: 'reorder', orderMap })
 if (!ok) {
 // 回滚到原顺序
 setTraining(t => t ? { ...t, problems: sorted } : t)
 }
 }

 const setScore = (problemId: string, score: number) => {
 setLocalScores(s => ({ ...s, [problemId]: score }))
 setDirty(d => new Set(d).add(problemId))
 }

 const setRequired = (problemId: string, required: boolean) => {
 setLocalRequired(r => ({ ...r, [problemId]: required }))
 setDirty(d => new Set(d).add(problemId))
 }

 const saveAllProblemChanges = async () => {
 if (dirty.size === 0) return
 setSavingProblems(true)
 const updates = Array.from(dirty).map(problemId => ({
 problemId,
 score: localScores[problemId] ?? 0,
 required: localRequired[problemId] ?? false,
 }))
 const ok = await patchProblems({ action: 'update', updates })
 if (ok) {
 toast.success(`已保存 ${updates.length} 项修改`)
 await fetchDetail() // 同步真实数据
 }
 setSavingProblems(false)
 }

 const discardChanges = () => {
 if (dirty.size === 0) return
 if (!confirm(`放弃 ${dirty.size} 项未保存的修改？`)) return
 if (!training) return
 const scores: Record<string, number> = {}
 const reqs: Record<string, boolean> = {}
 training.problems.forEach(p => {
 scores[p.problemId] = p.score
 reqs[p.problemId] = p.required
 })
 setLocalScores(scores)
 setLocalRequired(reqs)
 setDirty(new Set())
 }

 const addTag = () => {
 const t = tagInput.trim()
 if (t && !tags.includes(t)) setTags([...tags, t])
 setTagInput('')
 }

 const removeTag = (t: string) => setTags(tags.filter(x => x !== t))

 const sortedProblems = useMemo(
 () => training ? [...training.problems].sort((a, b) => a.orderIndex - b.orderIndex) : [],
 [training]
 )

 if (loading) {
 return (
 <AdminLayout>
 <div className="py-20 text-center text-muted-foreground">加载中...</div>
 </AdminLayout>
 )
 }
 if (error) {
 return (
 <AdminLayout>
 <div className="py-12 text-center">
 <AlertCircle className="w-10 h-10 mx-auto mb-3 text-error" />
 <p className="text-foreground mb-4">{error}</p>
 <button
 onClick={fetchDetail}
 className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-white shadow-md hover:shadow-lg hover:from-primary-light hover:to-primary transition-all"
 >
 <RefreshCw className="w-4 h-4" /> 重试
 </button>
 </div>
 </AdminLayout>
 )
 }
 if (!training) return null

 return (
 <AdminLayout>
 <div className="max-w-5xl mx-auto space-y-5">
 {/* 顶部导航 */}
 <div className="flex items-center justify-between gap-3">
 <div className="flex items-center gap-3 min-w-0">
 <Link
 href="/admin/trainings"
 className="p-1.5 -ml-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
 aria-label="返回题单列表"
 >
 <ArrowLeft className="w-5 h-5" />
 </Link>
 <h1 className="text-xl font-bold text-foreground truncate">编辑题单</h1>
 </div>
 <div className="flex items-center gap-2 flex-shrink-0">
 <Link
 href={`/training/${id}`}
 target="_blank"
 className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
 >
 <ExternalLink className="w-4 h-4" />
 预览
 </Link>
 <button
 onClick={saveMeta}
 disabled={saving}
 className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium rounded-lg bg-primary text-white shadow-md hover:shadow-lg hover:from-primary-light hover:to-primary transition-all disabled:opacity-50"
 >
 <Save className="w-4 h-4" />
 {saving ? '保存中...' : '保存修改'}
 </button>
 </div>
 </div>

 {/* 题单信息 */}
 <div className="card-static p-6 space-y-5">
 <div>
 <label className="block text-sm font-medium text-foreground mb-1.5">
 标题 <span className="text-error">*</span>
 </label>
 <input
 type="text"
 value={title}
 onChange={e => setTitle(e.target.value)}
 className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-colors"
 maxLength={100}
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-foreground mb-1.5">
 描述 <span className="text-error">*</span>
 </label>
 <textarea
 value={description}
 onChange={e => setDescription(e.target.value)}
 rows={4}
 className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-colors resize-y"
 />
 </div>

 <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
 <div>
 <label className="block text-sm font-medium text-foreground mb-1.5">
 分类 <span className="text-error">*</span>
 </label>
 <div className="flex items-center gap-5">
 <label className="flex items-center gap-2 cursor-pointer">
 <input
 type="radio"
 name="categoryType"
 value="official"
 checked={categoryType === 'official'}
 onChange={() => setCategoryType('official')}
 className="w-4 h-4 accent-primary"
 />
 <span className="text-sm text-foreground">官方</span>
 </label>
 <label className="flex items-center gap-2 cursor-pointer">
 <input
 type="radio"
 name="categoryType"
 value="contest"
 checked={categoryType === 'contest'}
 onChange={() => setCategoryType('contest')}
 className="w-4 h-4 accent-primary"
 />
 <span className="text-sm text-foreground">竞赛</span>
 </label>
 </div>
 </div>
 <div>
 <label className="block text-sm font-medium text-foreground mb-1.5">状态</label>
 <select
 value={status}
 onChange={e => setStatus(e.target.value)}
 className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
 >
 <option value="published">已发布</option>
 <option value="draft">草稿</option>
 <option value="archived">已归档</option>
 </select>
 </div>
 <div>
 <label className="block text-sm font-medium text-foreground mb-1.5">封面 URL</label>
 <input
 type="text"
 value={cover}
 onChange={e => setCover(e.target.value)}
 className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
 placeholder="可选"
 />
 </div>
 </div>

 <div>
 <label className="block text-sm font-medium text-foreground mb-1.5">标签</label>
 <div className="flex flex-wrap items-center gap-1.5 mb-2 min-h-[24px]">
 {tags.length === 0 ? (
 <span className="text-xs text-muted-foreground">暂无标签</span>
 ) : (
 tags.map(t => (
 <span key={t} className="tag tag-primary inline-flex items-center gap-1 text-xs">
 {t}
 <button onClick={() => removeTag(t)} className="hover:text-error" aria-label={`删除标签 ${t}`}>
 <X className="w-3 h-3" />
 </button>
 </span>
 ))
 )}
 </div>
 <div className="flex items-center gap-2">
 <input
 type="text"
 value={tagInput}
 onChange={e => setTagInput(e.target.value)}
 onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
 className="flex-1 px-3 py-1.5 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
 placeholder="输入标签后回车"
 />
 <button
 onClick={addTag}
 className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
 aria-label="添加标签"
 >
 <Plus className="w-4 h-4" />
 </button>
 </div>
 </div>

 <div className="flex flex-wrap items-center gap-5 pt-1">
 <label className="flex items-center gap-2 cursor-pointer">
 <input
 type="checkbox"
 checked={isPublic}
 onChange={e => setIsPublic(e.target.checked)}
 className="w-4 h-4 rounded accent-primary"
 />
 <span className="text-sm text-foreground">公开</span>
 </label>
 <label className="flex items-center gap-2 cursor-pointer">
 <input
 type="checkbox"
 checked={isRecommended}
 onChange={e => setIsRecommended(e.target.checked)}
 className="w-4 h-4 rounded accent-primary"
 />
 <span className="text-sm text-foreground">推荐到首页</span>
 </label>
 </div>
 </div>

 {/* 题目管理 */}
 <div className="card-static p-6 space-y-4">
 <div className="flex items-center justify-between gap-3 flex-wrap">
 <h2 className="text-base font-semibold text-foreground">题目管理</h2>
 <div className="flex items-center gap-2 flex-wrap">
 <span className="text-sm text-muted-foreground">
 共 {sortedProblems.length} 题
 {dirty.size > 0 && (
 <span className="ml-2 text-warning font-medium">· {dirty.size} 项未保存</span>
 )}
 </span>
 {dirty.size > 0 && (
 <>
 <button
 onClick={discardChanges}
 className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
 >
 放弃
 </button>
 <button
 onClick={saveAllProblemChanges}
 disabled={savingProblems}
 className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md bg-primary text-white shadow-sm hover:shadow hover:from-primary-light hover:to-primary transition-all disabled:opacity-50"
 >
 <Check className="w-3.5 h-3.5" />
 {savingProblems ? '保存中...' : '保存修改'}
 </button>
 </>
 )}
 </div>
 </div>

 <button
 onClick={() => setSearchOpen(!searchOpen)}
 className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium rounded-lg bg-primary text-white shadow-md hover:shadow-lg hover:from-primary-light hover:to-primary transition-all"
 >
 <Plus className="w-4 h-4" />
 {searchOpen ? '收起搜索' : '添加题目'}
 </button>

 {searchOpen && (
 <div className="border rounded-lg p-3 bg-muted/10 space-y-2" style={{ borderColor: 'var(--border)' }}>
 <div className="relative">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
 <input
 type="text"
 value={searchKw}
 onChange={e => setSearchKw(e.target.value)}
 className="w-full pl-9 pr-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
 placeholder="搜索题目..."
 autoFocus
 />
 </div>
 <div className="max-h-60 overflow-y-auto rounded-lg border bg-background" style={{ borderColor: 'var(--border)' }}>
 {searchResults.length === 0 ? (
 <div className="py-4 text-center text-muted-foreground text-sm">
 {searchKw ? '无匹配题目' : '输入关键词搜索'}
 </div>
 ) : (
 <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
 {searchResults.map(p => (
 <li key={p.id}>
 <button
 onClick={() => handleAddProblems([p.id])}
 className="w-full flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-primary/5 transition-colors text-left"
 >
 <Plus className="w-4 h-4 text-primary-light flex-shrink-0" />
 <span className="flex-1 text-sm text-foreground truncate">
 {p.problemNumber ? (
 <span className="text-muted-foreground">[{p.problemNumber}] </span>
 ) : null}
 {p.title}
 </span>
 <span className={`text-xs px-1.5 py-0.5 rounded border flex-shrink-0 ${difficultyClass(p.difficulty)}`}>
 {p.difficulty}
 </span>
 </button>
 </li>
 ))}
 </ul>
 )}
 </div>
 </div>
 )}

 {sortedProblems.length === 0 ? (
 <div className="py-12 text-center text-muted-foreground text-sm border rounded-lg" style={{ borderColor: 'var(--border)' }}>
 暂无题目，点击"添加题目"开始
 </div>
 ) : (
 <ul className="divide-y border rounded-lg bg-background/50" style={{ borderColor: 'var(--border)' }}>
 {sortedProblems.map((item, idx) => {
 const isDirty = dirty.has(item.problemId)
 return (
 <li
 key={item.id}
 className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${
 isDirty ? 'bg-warning/5' : 'hover:bg-muted'
 }`}
 >
 <span className="flex-shrink-0 w-7 text-center text-xs font-semibold text-muted-foreground">
 #{idx + 1}
 </span>
 <div className="flex-1 min-w-0">
 <div className="text-sm text-foreground truncate">
 {item.problem.problemNumber ? (
 <span className="text-muted-foreground">[{item.problem.problemNumber}] </span>
 ) : null}
 {item.problem.title}
 </div>
 <div className="flex items-center gap-2 mt-1">
 <span className={`text-xs px-1.5 py-0.5 rounded border flex-shrink-0 ${difficultyClass(item.problem.difficulty)}`}>
 {item.problem.difficulty}
 </span>
 </div>
 </div>
 {/* 分值 */}
 <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-shrink-0">
 <span>分值</span>
 <input
 type="number"
 value={localScores[item.problemId] ?? 0}
 onChange={e => setScore(item.problemId, parseInt(e.target.value) || 0)}
 className="w-16 px-1.5 py-1 bg-background border border-border rounded text-xs text-foreground focus:outline-none focus:border-primary/50"
 />
 </div>
 {/* 必做 */}
 <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer flex-shrink-0">
 <input
 type="checkbox"
 checked={localRequired[item.problemId] ?? false}
 onChange={e => setRequired(item.problemId, e.target.checked)}
 className="w-3.5 h-3.5 rounded accent-primary"
 />
 必做
 </label>
 {/* 顺序 + 删除 */}
 <div className="flex items-center gap-0.5 flex-shrink-0">
 <button
 onClick={() => handleMove(item.problemId, -1)}
 disabled={idx === 0}
 className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
 title="上移"
 >
 <ChevronUp className="w-4 h-4" />
 </button>
 <button
 onClick={() => handleMove(item.problemId, 1)}
 disabled={idx === sortedProblems.length - 1}
 className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
 title="下移"
 >
 <ChevronDown className="w-4 h-4" />
 </button>
 <button
 onClick={() => handleRemove(item.problemId)}
 className="p-1.5 rounded text-muted-foreground hover:text-error hover:bg-error/10"
 title="移除"
 >
 <Trash2 className="w-4 h-4" />
 </button>
 </div>
 </li>
 )
 })}
 </ul>
 )}
 </div>
 </div>
 </AdminLayout>
 )
}
