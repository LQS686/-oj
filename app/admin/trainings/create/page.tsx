'use client'

/**
 * app/admin/trainings/create/page.tsx
 * 管理后台 - 新建题单
 */
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AdminLayout from '@/components/AdminLayout'
import { ArrowLeft, Save, X, Plus, Search } from 'lucide-react'
import toast from 'react-hot-toast'

interface Problem {
 id: string
 title: string
 problemNumber?: string | null
 difficulty: string
}

const difficultyClass = (d: string) => {
 if (d?.includes('入门')) return 'bg-success/15 text-success border-success/30'
 if (d?.includes('普及')) return 'bg-warning/15 text-warning border-warning/30'
 if (d?.includes('提高') || d?.includes('省选') || d?.includes('NOI')) return 'bg-error/15 text-error border-error/30'
 return 'bg-primary/15 text-primary-light border-primary/30'
}

export default function CreateTrainingPage() {
 const router = useRouter()
 const [problems, setProblems] = useState<Problem[]>([])
 const [searchProblem, setSearchProblem] = useState('')
 const [filterDifficulty, setFilterDifficulty] = useState<string>('')

 const [form, setForm] = useState({
 title: '',
 description: '',
 categoryType: '' as '' | 'official' | 'contest',
 isPublic: true,
 status: 'published',
 isRecommended: false,
 tags: [] as string[],
 cover: '',
 problemIds: [] as string[],
 })
 const [tagInput, setTagInput] = useState('')
 const [submitting, setSubmitting] = useState(false)

 useEffect(() => {
 fetch('/api/problems?pageSize=50', { cache: 'no-store' })
 .then(r => r.json())
 .then(data => {
 const items = Array.isArray(data?.data?.problems) ? data.data.problems : []
 setProblems(items)
 })
 .catch(() => setProblems([]))
 }, [])

 const addTag = () => {
 const t = tagInput.trim()
 if (t && !form.tags.includes(t)) {
 setForm(f => ({ ...f, tags: [...f.tags, t] }))
 }
 setTagInput('')
 }

 const removeTag = (t: string) => {
 setForm(f => ({ ...f, tags: f.tags.filter(x => x !== t) }))
 }

 const toggleProblem = (id: string) => {
 setForm(f => ({
 ...f,
 problemIds: f.problemIds.includes(id)
 ? f.problemIds.filter(x => x !== id)
 : [...f.problemIds, id],
 }))
 }

 const handleSubmit = async (publish: boolean) => {
 if (!form.title || !form.description || !form.categoryType) {
 toast.error('请填写标题、描述、分类')
 return
 }
 setSubmitting(true)
 try {
 const res = await fetch('/api/trainings', {
 method: 'POST',
 cache: 'no-store',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 title: form.title,
 description: form.description,
 categoryType: form.categoryType || null,
 tags: form.tags,
 cover: form.cover || null,
 problemIds: form.problemIds,
 status: publish ? 'published' : 'draft',
 }),
 })
 const data = await res.json()
 if (data.success) {
 toast.success(publish ? '已发布' : '已保存草稿')
 router.push(`/admin/trainings/${data.data.id}`)
 } else {
 toast.error(data.error || '创建失败')
 }
 } catch {
 toast.error('网络错误')
 } finally {
 setSubmitting(false)
 }
 }

 const filteredProblems = useMemo(() => {
 const q = searchProblem.toLowerCase().trim()
 return problems
 .filter(p => {
 if (filterDifficulty && p.difficulty !== filterDifficulty) return false
 if (q && !p.title.toLowerCase().includes(q)) return false
 return true
 })
 .slice(0, 100)
 }, [problems, searchProblem, filterDifficulty])

 const difficulties = useMemo(() => {
 const set = new Set<string>()
 problems.forEach(p => p.difficulty && set.add(p.difficulty))
 return Array.from(set)
 }, [problems])

 return (
 <AdminLayout>
 <div className="max-w-5xl mx-auto space-y-5">
 {/* 顶部导航 */}
 <div className="flex items-center gap-3">
 <Link
 href="/admin/trainings"
 className="p-1.5 -ml-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
 aria-label="返回题单列表"
 >
 <ArrowLeft className="w-5 h-5" />
 </Link>
 <h1 className="text-xl font-bold text-foreground">新建题单</h1>
 </div>

 {/* 题单信息 */}
 <div className="card-static p-6 space-y-5">
 <div>
 <label className="block text-sm font-medium text-foreground mb-1.5">
 标题 <span className="text-error">*</span>
 </label>
 <input
 type="text"
 value={form.title}
 onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
 className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-colors"
 placeholder="例：动态规划入门"
 maxLength={100}
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-foreground mb-1.5">
 描述 <span className="text-error">*</span>
 </label>
 <textarea
 value={form.description}
 onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
 rows={4}
 className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-colors resize-y"
 placeholder="题单介绍（支持换行）"
 />
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
 checked={form.categoryType === 'official'}
 onChange={() => setForm(f => ({ ...f, categoryType: 'official' }))}
 className="w-4 h-4 accent-primary"
 />
 <span className="text-sm text-foreground">官方</span>
 </label>
 <label className="flex items-center gap-2 cursor-pointer">
 <input
 type="radio"
 name="categoryType"
 value="contest"
 checked={form.categoryType === 'contest'}
 onChange={() => setForm(f => ({ ...f, categoryType: 'contest' }))}
 className="w-4 h-4 accent-primary"
 />
 <span className="text-sm text-foreground">竞赛</span>
 </label>
 </div>
 </div>
 <div>
 <label className="block text-sm font-medium text-foreground mb-1.5">封面 URL</label>
 <input
 type="text"
 value={form.cover}
 onChange={e => setForm(f => ({ ...f, cover: e.target.value }))}
 className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
 placeholder="可选"
 />
 </div>
 </div>

 <div>
 <label className="block text-sm font-medium text-foreground mb-1.5">标签</label>
 <div className="flex flex-wrap items-center gap-1.5 mb-2 min-h-[24px]">
 {form.tags.length === 0 ? (
 <span className="text-xs text-muted-foreground">暂无标签</span>
 ) : (
 form.tags.map(t => (
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
 placeholder="输入标签后回车（含竞赛/CSP/NOIP/真题 等有助于归入竞赛分类）"
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
 checked={form.isPublic}
 onChange={e => setForm(f => ({ ...f, isPublic: e.target.checked }))}
 className="w-4 h-4 rounded accent-primary"
 />
 <span className="text-sm text-foreground">公开</span>
 </label>
 <label className="flex items-center gap-2 cursor-pointer">
 <input
 type="checkbox"
 checked={form.isRecommended}
 onChange={e => setForm(f => ({ ...f, isRecommended: e.target.checked }))}
 className="w-4 h-4 rounded accent-primary"
 />
 <span className="text-sm text-foreground">推荐到首页</span>
 </label>
 </div>
 </div>

 {/* 题目选择 */}
 <div className="card-static p-6 space-y-4">
 <div className="flex items-center justify-between">
 <h2 className="text-base font-semibold text-foreground">题目列表</h2>
 <span className="text-sm text-muted-foreground">
 共 {problems.length} 题 · 已选 {form.problemIds.length}
 </span>
 </div>

 <div className="flex flex-col sm:flex-row gap-2">
 <div className="relative flex-1">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
 <input
 type="text"
 value={searchProblem}
 onChange={e => setSearchProblem(e.target.value)}
 className="w-full pl-9 pr-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
 placeholder="搜索题目名称..."
 />
 </div>
 {difficulties.length > 0 && (
 <div className="flex items-center gap-1.5 flex-wrap">
 <button
 onClick={() => setFilterDifficulty('')}
 className={`text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
 !filterDifficulty
 ? 'border-primary bg-primary/10 text-primary-light'
 : 'border-border bg-muted text-muted-foreground hover:border-primary/40'
 }`}
 >
 全部
 </button>
 {difficulties.map(d => (
 <button
 key={d}
 onClick={() => setFilterDifficulty(d)}
 className={`text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
 filterDifficulty === d
 ? 'border-primary bg-primary/10 text-primary-light'
 : 'border-border bg-muted text-muted-foreground hover:border-primary/40'
 }`}
 >
 {d}
 </button>
 ))}
 </div>
 )}
 </div>

 <div className="border rounded-lg overflow-hidden bg-background/50" style={{ borderColor: 'var(--border)' }}>
 {filteredProblems.length === 0 ? (
 <div className="py-12 text-center text-muted-foreground text-sm">暂无题目</div>
 ) : (
 <ul className="divide-y max-h-[500px] overflow-y-auto" style={{ borderColor: 'var(--border)' }}>
 {filteredProblems.map(p => {
 const checked = form.problemIds.includes(p.id)
 const orderIndex = checked ? form.problemIds.indexOf(p.id) + 1 : null
 return (
 <li key={p.id}>
 <label
 className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
 checked ? 'bg-primary/5' : 'hover:bg-muted'
 }`}
 >
 <input
 type="checkbox"
 checked={checked}
 onChange={() => toggleProblem(p.id)}
 className="w-4 h-4 rounded accent-primary flex-shrink-0"
 />
 <span className={`flex-shrink-0 w-7 text-center text-xs font-semibold ${checked ? 'text-primary-light' : 'text-transparent'}`}>
 #{orderIndex ?? '-'}
 </span>
 <span className="flex-1 text-sm text-foreground truncate">
 {p.problemNumber ? (
 <span className="text-muted-foreground">[{p.problemNumber}] </span>
 ) : null}
 {p.title}
 </span>
 <span className={`text-xs px-1.5 py-0.5 rounded border flex-shrink-0 ${difficultyClass(p.difficulty)}`}>
 {p.difficulty}
 </span>
 </label>
 </li>
 )
 })}
 </ul>
 )}
 </div>
 </div>

 {/* 操作按钮 */}
 <div className="flex items-center justify-end gap-2 pb-2">
 <Link
 href="/admin/trainings"
 className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
 >
 取消
 </Link>
 <button
 onClick={() => handleSubmit(false)}
 disabled={submitting}
 className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
 >
 保存草稿
 </button>
 <button
 onClick={() => handleSubmit(true)}
 disabled={submitting}
 className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-white shadow-md hover:shadow-lg hover:from-primary-light hover:to-primary transition-all disabled:opacity-50"
 >
 <Save className="w-4 h-4" />
 {submitting ? '发布中...' : '发布'}
 </button>
 </div>
 </div>
 </AdminLayout>
 )
}
