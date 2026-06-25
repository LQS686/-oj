'use client'

/**
 * app/training/create/page.tsx
 * 用户端 - 创建我的题单
 *
 * 与 admin/trainings/create 的区别：
 * 1. 不暴露 isPublic / isRecommended / status 字段（后端对普通用户自动强制 isPublic=false + status='draft'）
 * 2. 顶部提示：题单创建后默认是"私有草稿"，仅自己可见；如需公开/推荐请联系管理员
 * 3. 提交后跳转到 /training/{id}
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save, X, Plus, Info, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'

interface Problem {
 id: string
 title: string
 problemNumber?: string | null
 difficulty: string
}

export default function CreateMyTrainingPage() {
 const router = useRouter()
 const [problems, setProblems] = useState<Problem[]>([])
 const [searchProblem, setSearchProblem] = useState('')
 const [checkingAuth, setCheckingAuth] = useState(true)
 const [authed, setAuthed] = useState(false)

 const [form, setForm] = useState({
 title: '',
 description: '',
 tags: [] as string[],
 cover: '',
 problemIds: [] as string[],
 })
 const [tagInput, setTagInput] = useState('')
 const [submitting, setSubmitting] = useState(false)

 // 鉴权检查：未登录跳登录页
 useEffect(() => {
 fetch('/api/auth/me', { cache: 'no-store' })
 .then(r => r.ok ? r.json() : null)
 .then(data => {
 if (data?.success && data.data) {
 setAuthed(true)
 } else {
 toast.error('请先登录后再创建题单')
 router.replace('/login?redirect=/training/create')
 }
 })
 .catch(() => {
 toast.error('请先登录后再创建题单')
 router.replace('/login?redirect=/training/create')
 })
 .finally(() => setCheckingAuth(false))
 }, [router])

 useEffect(() => {
 if (!authed) return
 // 拉取题目列表（后端 pageSize 上限 50）
 fetch('/api/problems?pageSize=50', { cache: 'no-store' })
 .then(r => r.json())
 .then(data => {
 const items = Array.isArray(data?.data?.problems) ? data.data.problems : []
 setProblems(items)
 })
 .catch(() => setProblems([]))
 }, [authed])

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

 const handleSubmit = async () => {
 if (!form.title || !form.description) {
 toast.error('请填写标题、描述')
 return
 }
 setSubmitting(true)
 try {
 // 不传 categoryType / isPublic / status / isRecommended，后端对普通用户自动强制为私有草稿
 const res = await fetch('/api/trainings', {
 method: 'POST',
 cache: 'no-store',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 title: form.title,
 description: form.description,
 tags: form.tags,
 cover: form.cover || null,
 problemIds: form.problemIds,
 }),
 })
 const data = await res.json()
 if (data.success) {
 toast.success('题单已创建（私有草稿）')
 router.push(`/training/${data.data.id}`)
 } else {
 toast.error(data.error || '创建失败')
 }
 } catch {
 toast.error('网络错误')
 } finally {
 setSubmitting(false)
 }
 }

 const filteredProblems = problems.filter(p =>
 !searchProblem || p.title.toLowerCase().includes(searchProblem.toLowerCase())
 ).slice(0, 100)

 if (checkingAuth) {
 return (
 <div className="min-h-screen flex items-center justify-center">
 <div className="text-muted-foreground text-sm">加载中...</div>
 </div>
 )
 }

 if (!authed) {
 return null
 }

 return (
 <div className="min-h-screen">
 <div className="container mx-auto px-4 py-8 max-w-6xl">
 <div className="flex items-center justify-between mb-6">
 <div className="flex items-center gap-3">
 <Link href="/training" className="text-muted-foreground hover:text-foreground">
 <ArrowLeft className="w-5 h-5" />
 </Link>
 <h1 className="text-2xl font-bold text-foreground">创建我的题单</h1>
 </div>
 </div>

 {/* 提示卡 */}
 <div className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-4 flex items-start gap-3">
 <Info className="w-5 h-5 text-primary-light flex-shrink-0 mt-0.5" />
 <div className="text-sm text-foreground/80">
 <div className="font-medium text-foreground mb-1">关于题单权限</div>
 <div>
 您创建的题单默认是 <span className="text-primary-light font-semibold">"私有草稿"</span>，
 只有您自己可见（在"我的题单"中可查看）。如需发布到题单广场供其他用户使用，请联系管理员审核。
 </div>
 </div>
 </div>

 <div className="card-static p-6 space-y-4">
 <div>
 <label className="block text-sm font-medium text-foreground mb-1.5">标题 *</label>
 <input
 type="text"
 value={form.title}
 onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
 className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
 placeholder="例：图论进阶刷题计划"
 maxLength={80}
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-foreground mb-1.5">描述 *</label>
 <textarea
 value={form.description}
 onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
 rows={5}
 className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
 placeholder="介绍一下这个题单的用途、目标人群、推荐学习顺序等（支持换行）"
 />
 </div>

 <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
 <div>
 <label className="block text-sm font-medium text-foreground mb-1.5">封面 URL</label>
 <input
 type="text"
 value={form.cover}
 onChange={e => setForm(f => ({ ...f, cover: e.target.value }))}
 className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground"
 placeholder="可选"
 />
 </div>
 </div>

 <div>
 <label className="block text-sm font-medium text-foreground mb-1.5">标签</label>
 <div className="flex flex-wrap items-center gap-2 mb-2">
 {form.tags.map(t => (
 <span key={t} className="tag tag-primary inline-flex items-center gap-1">
 {t}
 <button onClick={() => removeTag(t)} className="hover:text-error">
 <X className="w-3 h-3" />
 </button>
 </span>
 ))}
 </div>
 <div className="flex items-center gap-2">
 <input
 type="text"
 value={tagInput}
 onChange={e => setTagInput(e.target.value)}
 onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
 className="flex-1 px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground"
 placeholder="输入标签后回车（如：CSP、动态规划、图论）"
 maxLength={20}
 />
 <button onClick={addTag} className="btn-ghost btn">
 <Plus className="w-4 h-4" />
 </button>
 </div>
 <p className="text-xs text-muted-foreground mt-1.5">
 添加竞赛相关标签（如 CSP / NOIP / 考级 / 真题）有助于将题单归入"竞赛/考级真题"分类
 </p>
 </div>
 </div>

 {/* 题目选择 */}
 <div className="card-static p-6 space-y-3 mt-4">
 <div className="flex items-center justify-between">
 <h2 className="text-lg font-bold text-foreground">题目列表</h2>
 <span className="text-sm text-muted-foreground">已选 {form.problemIds.length} 题</span>
 </div>
 <input
 type="text"
 value={searchProblem}
 onChange={e => setSearchProblem(e.target.value)}
 className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground"
 placeholder="搜索题目..."
 />
 {form.problemIds.length === 0 && (
 <div className="flex items-start gap-2 rounded-lg bg-warning/10 border border-warning/30 px-3 py-2 text-sm text-foreground/80">
 <AlertCircle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
 <span>题单创建后也可以再添加题目，不必一次选完。</span>
 </div>
 )}
 <div className="max-h-96 overflow-y-auto space-y-1">
 {filteredProblems.length === 0 ? (
 <div className="py-8 text-center text-muted-foreground text-sm">暂无题目</div>
 ) : filteredProblems.map(p => {
 const checked = form.problemIds.includes(p.id)
 const orderIndex = checked ? form.problemIds.indexOf(p.id) + 1 : null
 return (
 <label
 key={p.id}
 className="flex items-center gap-3 px-3 py-2 rounded hover:bg-muted cursor-pointer"
 >
 <input
 type="checkbox"
 checked={checked}
 onChange={() => toggleProblem(p.id)}
 className="rounded"
 />
 {orderIndex !== null && (
 <span className="text-xs text-muted-foreground w-6 text-right">
 #{orderIndex}
 </span>
 )}
 <span className="flex-1 text-sm text-foreground truncate">
 {p.problemNumber ? `[${p.problemNumber}] ` : ''}{p.title}
 </span>
 <span className="text-xs text-muted-foreground">{p.difficulty}</span>
 </label>
 )
 })}
 </div>
 </div>

 <div className="flex items-center justify-end gap-2 mt-6">
 <Link href="/training" className="btn-ghost btn">取消</Link>
 <button
 onClick={handleSubmit}
 disabled={submitting}
 className="btn-primary btn"
 >
 <Save className="w-4 h-4" />
 {submitting ? '创建中...' : '创建题单'}
 </button>
 </div>
 </div>
 </div>
 )
}
