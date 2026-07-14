'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
 ChevronRight,
 Send,
 X,
 ChevronDown,
 Code2,
 AlertCircle,
 Loader2,
 Lightbulb,
 CheckCircle2
} from 'lucide-react'
import MarkdownEditor from '@/components/solution/MarkdownEditor'
import { logger } from '@/lib/logger'
import { fetchWithCookie } from '@/lib/api/base'

const CODE_LANGUAGES: { value: string; label: string }[] = [
 { value: 'cpp', label: 'C++' },
 { value: 'c', label: 'C' },
 { value: 'java', label: 'Java' },
 { value: 'python', label: 'Python' },
 { value: 'javascript', label: 'JavaScript' },
 { value: 'go', label: 'Go' },
 { value: 'rust', label: 'Rust' }
]

interface ProblemSummary {
 id: string
 title: string
 problemNumber?: string
}

const TITLE_MIN = 1
const TITLE_MAX = 100
const CONTENT_MIN = 10
const CONTENT_MAX = 50000

export default function NewSolutionPage() {
 const params = useParams<{ id: string }>()
 const router = useRouter()
 const problemId = params?.id ?? ''

 const [problem, setProblem] = useState<ProblemSummary | null>(null)
 const [problemLoading, setProblemLoading] = useState(true)
 const [problemError, setProblemError] = useState<string | null>(null)

 const [title, setTitle] = useState('')
 const [content, setContent] = useState('')
 const [codeLanguage, setCodeLanguage] = useState<string>('cpp')
 const [code, setCode] = useState('')
 const [codeOpen, setCodeOpen] = useState(true)

 const [submitting, setSubmitting] = useState(false)
 const [error, setError] = useState<string | null>(null)

 // 加载题目信息（用于面包屑标题）
 useEffect(() => {
 if (!problemId) return
 let cancelled = false

 const loadProblem = async () => {
 try {
 setProblemLoading(true)
 setProblemError(null)
 const res = await fetchWithCookie(`/api/problems/${problemId}`)
 const data = await res.json().catch(() => null)
 if (cancelled) return
 if (res.ok && data?.success) {
 const p = data.data
 setProblem({
 id: p.id,
 title: p.title ?? '',
 problemNumber: p.problemNumber
 })
 } else {
 setProblemError(data?.error || '获取题目信息失败')
 }
 } catch (err) {
 if (cancelled) return
 logger.error('加载题目信息失败', err)
 setProblemError('网络错误，请稍后重试')
 } finally {
 if (!cancelled) setProblemLoading(false)
 }
 }

 loadProblem()
 return () => {
 cancelled = true
 }
 }, [problemId])

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
 const canSubmit = titleValid && contentValid && !submitting && !!problemId

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault()
 if (!canSubmit) {
 if (!titleValid) setError(`标题长度需在 ${TITLE_MIN}-${TITLE_MAX} 字符之间`)
 else if (!contentValid) setError(`内容长度需在 ${CONTENT_MIN}-${CONTENT_MAX} 字符之间`)
 return
 }

 setSubmitting(true)
 setError(null)

 try {
 const res = await fetchWithCookie('/api/solutions', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 problemId,
 title: title.trim(),
 content,
 codeLanguage: code.trim() ? codeLanguage : null,
 code: code.trim() ? code : null
 })
 })

 const data = await res.json().catch(() => null)
 if (res.ok && data?.success) {
 const newId = data?.data?.id
 if (newId) {
 router.push(`/problems/${problemId}/solutions/${newId}`)
 } else {
 setError('发布成功但未返回题解 ID')
 }
 } else {
 setError(data?.error || `发布失败（HTTP ${res.status}）`)
 }
 } catch (err) {
 logger.error('发布题解失败', err)
 setError('网络错误，请稍后重试')
 } finally {
 setSubmitting(false)
 }
 }

 const handleCancel = () => {
 router.push(`/problem/${problemId}`)
 }

 return (
 <div className="min-h-screen py-8">
 <div className="container mx-auto px-4 max-w-5xl">
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
 {problemLoading ? (
 <span className="inline-flex items-center gap-1.5">
 <Loader2 className="w-3.5 h-3.5 animate-spin" />
 加载题目…
 </span>
 ) : problem ? (
 <Link
 href={`/problem/${problem.id}`}
 className="hover:text-primary transition-colors line-clamp-1 max-w-[28rem]"
 title={problem.title}
 >
 {problem.problemNumber ? `${problem.problemNumber} - ` : ''}
 {problem.title}
 </Link>
 ) : (
 <span className="text-error">题目加载失败</span>
 )}
 <ChevronRight className="w-3.5 h-3.5 opacity-60" />
 <span className="text-foreground font-medium">发布题解</span>
 </nav>

 <div className="card-static rounded-lg overflow-hidden">
 <div className="px-6 py-5 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg">
 <Lightbulb className="w-5 h-5 text-white" />
 </div>
 <div>
 <h1 className="text-xl font-bold text-foreground">发布新题解</h1>
 <p className="text-sm text-muted-foreground">
 分享你的解题思路，帮助更多同学
 </p>
 </div>
 </div>
 </div>

 <form onSubmit={handleSubmit} className="p-6 space-y-6">
 {problemError && (
 <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-error/10 border border-error/30 text-error">
 <AlertCircle className="w-5 h-5 flex-shrink-0" />
 <span>{problemError}</span>
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
 已就绪，可以发布
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
 发布中…
 </>
 ) : (
 <>
 <Send className="w-4 h-4" />
 发布题解
 </>
 )}
 </button>
 </div>
 </div>
 </form>
 </div>
 </div>
 </div>
 )
}
