'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
 ChevronRight,
 Save,
 X,
 ChevronDown,
 Code2,
 AlertCircle,
 Loader2,
 PencilLine,
 CheckCircle2,
 ShieldAlert
} from 'lucide-react'
import MarkdownEditor from '@/components/solution/MarkdownEditor'
import { useUser } from '@/contexts/UserContext'
import { logger } from '@/lib/logger'
import { fetchWithCookie } from '@/lib/api/base'
import { canManageContent } from '@/lib/permissions'
import { PageContainer } from '@/components/layout'

// 评测机减负（2026-07）：移除 java/javascript/go/rust，仅保留 C/C++/Python
const CODE_LANGUAGES: { value: string; label: string }[] = [
 { value: 'cpp', label: 'C++' },
 { value: 'c', label: 'C' },
 { value: 'python', label: 'Python' },
]

const TITLE_MIN = 1
const TITLE_MAX = 100
const CONTENT_MIN = 10
const CONTENT_MAX = 50000

interface SolutionAuthor {
 id: string
 username?: string
 nickname?: string
}

interface SolutionDetail {
 id: string
 problemId: string
 title: string
 content: string
 codeLanguage: string | null
 code: string | null
 author: SolutionAuthor
}

interface ProblemSummary {
 id: string
 title: string
 problemNumber?: string
}

export default function EditSolutionPage() {
 const params = useParams<{ id: string; solutionId: string }>()
 const router = useRouter()
 const { user } = useUser()

 const problemId = params?.id ?? ''
 const solutionId = params?.solutionId ?? ''

 const [solution, setSolution] = useState<SolutionDetail | null>(null)
 const [problem, setProblem] = useState<ProblemSummary | null>(null)

 const [loading, setLoading] = useState(true)
 const [loadError, setLoadError] = useState<string | null>(null)
 const [forbidden, setForbidden] = useState(false)

 const [title, setTitle] = useState('')
 const [content, setContent] = useState('')
 const [codeLanguage, setCodeLanguage] = useState<string>('cpp')
 const [code, setCode] = useState('')
 const [codeOpen, setCodeOpen] = useState(true)

 const [submitting, setSubmitting] = useState(false)
 const [error, setError] = useState<string | null>(null)
 const [canEditPerm, setCanEditPerm] = useState(false)

 // 加载题解详情
 useEffect(() => {
 if (!solutionId) return
 let cancelled = false

 const loadSolution = async () => {
 try {
 setLoading(true)
 setLoadError(null)
 setForbidden(false)

 const res = await fetchWithCookie(`/api/solutions/${solutionId}`)
 const data = await res.json().catch(() => null)

 if (cancelled) return

 if (!res.ok) {
 if (res.status === 403) {
 setForbidden(true)
 return
 }
 if (res.status === 404) {
 setLoadError('题解不存在或已被删除')
 return
 }
 setLoadError(data?.error || `加载题解失败（HTTP ${res.status}）`)
 return
 }

 if (!data?.success) {
 setLoadError(data?.error || '加载题解失败')
 return
 }

 const s = data.data as SolutionDetail
 setSolution(s)
 setTitle(s.title ?? '')
 setContent(s.content ?? '')
 setCodeLanguage(s.codeLanguage || 'cpp')
 setCode(s.code ?? '')
 // 配套代码区域：有代码时默认展开
 setCodeOpen(!!(s.code && s.code.trim()))

 // 同步加载题目信息用于面包屑
 if (s.problemId) {
 fetchWithCookie(`/api/problems/${s.problemId}`)
  .then((r) => r.json().catch(() => null))
 .then((pd) => {
 if (cancelled) return
 if (pd?.success && pd.data) {
 setProblem({
 id: pd.data.id,
 title: pd.data.title ?? '',
 problemNumber: pd.data.problemNumber
 })
 }
 })
 .catch((err) => logger.error('加载题目信息失败', err))
 }
 } catch (err) {
 if (cancelled) return
 logger.error('加载题解详情失败', err)
 setLoadError('网络错误，请稍后重试')
 } finally {
 if (!cancelled) setLoading(false)
 }
 }

 loadSolution()
 return () => {
 cancelled = true
 }
 }, [solutionId])

 useEffect(() => {
 if (!user) {
 setCanEditPerm(false)
 return
 }
 setCanEditPerm(canManageContent(user))
 }, [user])

 // 权限校验（在 user 与 solution 都就绪后判断）
 const userId = user?.id ?? null
 const isAuthor = !!(userId && solution?.author?.id && userId === solution.author.id)
 const canEdit = isAuthor || canEditPerm

 const titleLength = title.length
 const contentLength = content.length

 const titleError = (() => {
 if (titleLength === 0) return null
 if (titleLength < TITLE_MIN || titleLength > TITLE_MAX) {
 return `标题长度需在 ${TITLE_MIN}-${TITLE_MAX} 字符之间`
 }
 return null
 })()

 const contentError = (() => {
 if (contentLength === 0) return null
 if (contentLength < CONTENT_MIN || contentLength > CONTENT_MAX) {
 return `内容长度需在 ${CONTENT_MIN}-${CONTENT_MAX} 字符之间`
 }
 return null
 })()

 const titleValid = titleLength >= TITLE_MIN && titleLength <= TITLE_MAX
 const contentValid =
 contentLength >= CONTENT_MIN && contentLength <= CONTENT_MAX
 const canSubmit =
 canEdit && titleValid && contentValid && !submitting && !!solutionId

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault()
 if (!canEdit) {
 setError('无权限编辑此题解')
 return
 }
 if (!titleValid) {
 setError(`标题长度需在 ${TITLE_MIN}-${TITLE_MAX} 字符之间`)
 return
 }
 if (!contentValid) {
 setError(`内容长度需在 ${CONTENT_MIN}-${CONTENT_MAX} 字符之间`)
 return
 }

 setSubmitting(true)
 setError(null)

 try {
 const res = await fetchWithCookie(`/api/solutions/${solutionId}`, {
 method: 'PATCH',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 title: title.trim(),
 content,
 codeLanguage: code.trim() ? codeLanguage : null,
 code: code.trim() ? code : null
 })
 })

 const data = await res.json().catch(() => null)
 if (res.ok && data?.success) {
 const targetProblemId = solution?.problemId || problemId
 router.push(`/problems/${targetProblemId}/solutions/${solutionId}`)
 } else {
 if (res.status === 403) {
 setForbidden(true)
 return
 }
 setError(data?.error || `保存失败（HTTP ${res.status}）`)
 }
 } catch (err) {
 logger.error('更新题解失败', err)
 setError('网络错误，请稍后重试')
 } finally {
 setSubmitting(false)
 }
 }

 const handleCancel = () => {
 const targetProblemId = solution?.problemId || problemId
 router.push(`/problems/${targetProblemId}/solutions/${solutionId}`)
 }

 // 加载中
 if (loading) {
 return (
 <div className="min-h-screen flex items-center justify-center">
 <div className="text-center">
 <Loader2 className="w-10 h-10 mx-auto mb-4 text-primary animate-spin" />
 <p className="text-muted-foreground">加载题解中…</p>
 </div>
 </div>
 )
 }

 // 加载错误或题解不存在
 if (loadError) {
 return (
 <div className="min-h-screen flex items-center justify-center px-4">
 <div className="card-static rounded-lg p-10 text-center max-w-md w-full">
 <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-5">
 <AlertCircle className="w-8 h-8 text-error" />
 </div>
 <h2 className="text-lg font-semibold text-foreground mb-2">无法加载题解</h2>
 <p className="text-muted-foreground mb-6">{loadError}</p>
 <button
 onClick={() => router.push(`/problem/${problemId}`)}
 className="btn btn-primary px-6 py-2.5"
 >
 返回题目
 </button>
 </div>
 </div>
 )
 }

 // 无权限
 if (!canEdit) {
 return (
 <div className="min-h-screen flex items-center justify-center px-4">
 <div className="card-static rounded-lg p-10 text-center max-w-md w-full">
 <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-5">
 <ShieldAlert className="w-8 h-8 text-error" />
 </div>
 <h2 className="text-lg font-semibold text-foreground mb-2">无权限</h2>
 <p className="text-muted-foreground mb-6">
 仅题解作者本人或管理员/教师可以编辑此题解
 </p>
 <div className="flex items-center justify-center gap-3">
 <button
 onClick={() => router.push(`/problem/${problemId}`)}
 className="px-5 py-2.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
 >
 返回题目
 </button>
 {solution && (
 <Link
 href={`/problems/${solution.problemId}/solutions/${solutionId}`}
 className="btn btn-primary px-6 py-2.5"
 >
 查看题解
 </Link>
 )}
 </div>
 </div>
 </div>
 )
 }

 return (
 <div className="min-h-screen py-8">
 <PageContainer variant="form">
 {/* 面包屑 */}
 <nav
 aria-label="面包屑导航"
 className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground mb-6"
 >
 <Link
 href="/problems"
 className="hover:text-primary transition-colors"
 >
 题库
 </Link>
 <ChevronRight className="w-3.5 h-3.5 opacity-60" />
 {problem ? (
 <Link
 href={`/problem/${problem.id}`}
 className="hover:text-primary transition-colors line-clamp-1 max-w-[28rem]"
 title={problem.title}
 >
 {problem.problemNumber ? `${problem.problemNumber} - ` : ''}
 {problem.title}
 </Link>
 ) : (
 <span className="line-clamp-1 max-w-[28rem]">题目</span>
 )}
 <ChevronRight className="w-3.5 h-3.5 opacity-60" />
 {solution && (
 <Link
 href={`/problems/${solution.problemId}/solutions/${solutionId}`}
 className="hover:text-primary transition-colors line-clamp-1 max-w-[20rem]"
 title={solution.title}
 >
 {solution.title}
 </Link>
 )}
 <ChevronRight className="w-3.5 h-3.5 opacity-60" />
 <span className="text-foreground font-medium">编辑</span>
 </nav>

 <div className="card-static rounded-lg overflow-hidden">
 <div className="px-6 py-5 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg">
 <PencilLine className="w-5 h-5 text-white" />
 </div>
 <div>
 <h1 className="text-xl font-bold text-foreground">编辑题解</h1>
 <p className="text-sm text-muted-foreground">
 修改你的题解内容后保存
 </p>
 </div>
 </div>
 </div>

 <form onSubmit={handleSubmit} className="p-6 space-y-6">
 {forbidden && (
 <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-error/10 border border-error/30 text-error">
 <ShieldAlert className="w-5 h-5 flex-shrink-0" />
 <span>无权限执行此操作</span>
 </div>
 )}

 {error && (
 <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-error/10 border border-error/30 text-error">
 <div className="w-8 h-8 rounded-lg bg-error/20 flex items-center justify-center flex-shrink-0">
 <span className="text-lg">⚠</span>
 </div>
 <span>{error}</span>
 </div>
 )}

 {/* 标题 */}
 <div>
 <div className="flex items-center justify-between mb-2">
 <label
 htmlFor="solution-title"
 className="block text-sm font-medium text-foreground"
 >
 题解标题 <span className="text-error">*</span>
 </label>
 <span
 className={`text-xs ${
 titleLength > TITLE_MAX
 ? 'text-error'
 : titleLength > TITLE_MAX - 10
 ? 'text-accent'
 : 'text-muted-foreground'
 }`}
 >
 {titleLength}/{TITLE_MAX}
 </span>
 </div>
 <input
 id="solution-title"
 type="text"
 value={title}
 onChange={(e) => setTitle(e.target.value)}
 maxLength={TITLE_MAX + 20}
 placeholder="给你的题解起一个清晰的标题…"
 className={`w-full px-4 py-3 rounded-xl bg-background-secondary border focus:ring-2 transition-all text-foreground placeholder:text-muted-foreground ${
 titleError
 ? 'border-error/50 focus:border-error focus:ring-error/20'
 : 'border-border focus:border-primary focus:ring-primary/20'
 }`}
 />
 {titleError && (
 <p className="mt-1.5 text-xs text-error">{titleError}</p>
 )}
 </div>

 {/* 内容 */}
 <div>
 <div className="flex items-center justify-between mb-2">
 <label className="block text-sm font-medium text-foreground">
 题解内容 <span className="text-error">*</span>
 </label>
 <span
 className={`text-xs ${
 contentLength > CONTENT_MAX
 ? 'text-error'
 : contentLength < CONTENT_MIN
 ? 'text-muted-foreground'
 : 'text-secondary'
 }`}
 >
 {contentLength.toLocaleString()} / {CONTENT_MAX.toLocaleString()}
 </span>
 </div>
 <MarkdownEditor
 value={content}
 onChange={setContent}
 minHeight={420}
 maxLength={CONTENT_MAX}
 placeholder="详细描述你的解题思路、关键算法与复杂度分析…"
 disabled={submitting}
 />
 {contentError && (
 <p className="mt-1.5 text-xs text-error">{contentError}</p>
 )}
 {contentValid && (
 <p className="mt-1.5 text-xs text-secondary inline-flex items-center gap-1.5">
 <CheckCircle2 className="w-3.5 h-3.5" />
 内容长度符合要求
 </p>
 )}
 </div>

 {/* 配套代码 */}
 <div className="rounded-xl border border-border overflow-hidden">
 <button
 type="button"
 onClick={() => setCodeOpen((v) => !v)}
 className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-background-secondary/60 hover:bg-background-secondary transition-colors"
 aria-expanded={codeOpen}
 >
 <span className="flex items-center gap-2 text-sm font-medium text-foreground">
 <Code2 className="w-4 h-4 text-primary-light" />
 配套代码（可选）
 </span>
 <ChevronDown
 className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${
 codeOpen ? 'rotate-180' : ''
 }`}
 />
 </button>

 {codeOpen && (
 <div className="p-4 space-y-3 border-t border-border">
 <div className="flex items-center gap-3">
 <label
 htmlFor="code-language"
 className="text-sm text-muted-foreground whitespace-nowrap"
 >
 代码语言
 </label>
 <select
 id="code-language"
 value={codeLanguage}
 onChange={(e) => setCodeLanguage(e.target.value)}
 className="px-3 py-2 rounded-lg bg-background-secondary border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 text-foreground text-sm transition-all"
 >
 {CODE_LANGUAGES.map((lang) => (
 <option key={lang.value} value={lang.value}>
 {lang.label}
 </option>
 ))}
 </select>
 {code.trim() && (
 <span className="text-xs text-muted-foreground">
 {code.split('\n').length} 行 · {code.length} 字符
 </span>
 )}
 </div>

 <textarea
 value={code}
 onChange={(e) => setCode(e.target.value)}
 spellCheck={false}
 placeholder={`在此粘贴你的 ${CODE_LANGUAGES.find((l) => l.value === codeLanguage)?.label ?? ''} 代码…`}
 className="w-full min-h-[260px] px-4 py-3 rounded-lg bg-background border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 text-foreground placeholder:text-muted-foreground font-mono text-sm leading-6 transition-all custom-scrollbar resize-y"
 />
 </div>
 )}
 </div>

 {/* 操作按钮 */}
 <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 border-t border-border">
 <div className="text-xs text-muted-foreground">
 {canSubmit ? (
 <span className="inline-flex items-center gap-1.5 text-secondary">
 <CheckCircle2 className="w-3.5 h-3.5" />
 已就绪，可以保存
 </span>
 ) : (
 <span>
 请确保标题 {TITLE_MIN}-{TITLE_MAX} 字、内容 {CONTENT_MIN}-{CONTENT_MAX} 字
 </span>
 )}
 </div>
 <div className="flex items-center gap-3">
 <button
 type="button"
 onClick={handleCancel}
 disabled={submitting}
 className="px-5 py-2.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-all flex items-center gap-2 disabled:opacity-50"
 >
 <X className="w-4 h-4" />
 取消
 </button>
 <button
 type="submit"
 disabled={!canSubmit}
 className={`relative px-6 py-2.5 rounded-xl font-medium transition-all duration-300 flex items-center gap-2 overflow-hidden ${
 canSubmit
 ? 'bg-primary text-white shadow-lg hover:shadow-xl'
 : 'bg-muted text-muted-foreground cursor-not-allowed'
 }`}
 >
 {submitting ? (
 <>
 <Loader2 className="w-4 h-4 animate-spin" />
 保存中…
 </>
 ) : (
 <>
 <Save className="w-4 h-4" />
 保存修改
 </>
 )}
 </button>
 </div>
 </div>
 </form>
 </div>
 </PageContainer>
 </div>
 )
}
