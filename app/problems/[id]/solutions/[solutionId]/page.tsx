'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
 ArrowLeft,
 Eye,
 Clock,
 Code2,
 Edit,
 Trash2,
 AlertCircle,
 FileCode,
 Sparkles,
 XCircle
} from 'lucide-react'
import { useUser } from '@/contexts/UserContext'
import { fetchWithCookie } from '@/lib/api/base'
import { formatRelativeTime } from '@/lib/utils'
import { canManageContent } from '@/lib/permissions'
import MarkdownRenderer from '@/components/common/MarkdownRenderer'

interface SolutionDetail {
 id: string
 problemId: string
 authorId: string
 title: string
 content: string
 codeLanguage: string | null
 code: string | null
 views: number
 isOfficial: boolean
 sourceType: string
 createdAt: string
 updatedAt: string
 author: {
 id: string
 username: string
 nickname?: string
 avatar?: string | null
 }
}

interface ProblemSummary {
 id: string
 title: string
 problemNumber?: string
}

const LANGUAGE_COLOR_MAP: Record<string, string> = {
 cpp: 'from-blue-500 to-indigo-500',
 c: 'from-slate-500 to-slate-700',
 java: 'from-orange-500 to-red-500',
 python: 'from-yellow-400 to-blue-500',
 javascript: 'from-yellow-300 to-amber-500',
 typescript: 'from-blue-400 to-blue-600',
 go: 'from-cyan-400 to-teal-500',
 rust: 'from-orange-600 to-amber-700',
}

function getLanguageGradient(language: string | null | undefined): string {
 const key = (language || '').toLowerCase()
 return LANGUAGE_COLOR_MAP[key] || 'from-slate-400 to-slate-600'
}

function getAuthorInitial(name?: string): string {
 if (!name) return '?'
 return name.charAt(0).toUpperCase()
}

export default function SolutionDetailPage() {
 const params = useParams()
 const router = useRouter()
 const { user } = useUser()

 const pid = (params?.id as string) || ''
 const sid = (params?.solutionId as string) || ''

 const [solution, setSolution] = useState<SolutionDetail | null>(null)
 const [problem, setProblem] = useState<ProblemSummary | null>(null)
 const [loading, setLoading] = useState(true)
 const [error, setError] = useState<string | null>(null)
 const [notFound, setNotFound] = useState(false)
 const [deleting, setDeleting] = useState(false)
 const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
 const [canEditPerm, setCanEditPerm] = useState(false)

 useEffect(() => {
 if (!pid || !sid) return
 fetchSolution()
 fetchProblem()
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [pid, sid])

 useEffect(() => {
 if (!user) {
 setCanEditPerm(false)
 return
 }
 setCanEditPerm(canManageContent(user))
 }, [user])

 const fetchSolution = async () => {
 try {
 setLoading(true)
 setError(null)
 setNotFound(false)
 const response = await fetchWithCookie(`/api/solutions/${sid}`)
 const data = await response.json().catch(() => null)

 if (response.status === 404) {
 setNotFound(true)
 return
 }

 if (!response.ok || !data || data.success !== true) {
 setError(data?.error?.message || '获取题解失败')
 return
 }

 setSolution(data.data as SolutionDetail)
 } catch (err) {
 setError('网络错误，请稍后重试')
 } finally {
 setLoading(false)
 }
 }

 const fetchProblem = async () => {
 try {
 const response = await fetchWithCookie(`/api/problems/${pid}`)
 const data = await response.json().catch(() => null)
 if (data?.success && data.data) {
 setProblem({
 id: data.data.id,
 title: data.data.title,
 problemNumber: data.data.problemNumber,
 })
 }
 } catch {
 // 题目标题获取失败不影响主流程
 }
 }

 const handleDelete = async () => {
 if (!solution) return
 try {
 setDeleting(true)
 const response = await fetchWithCookie(`/api/solutions/${solution.id}`, {
 method: 'DELETE',
 })
 const data = await response.json().catch(() => null)
 if (data?.success) {
 router.push(`/problem/${pid}`)
 } else {
 setError(data?.error?.message || '删除失败')
 }
 } catch {
 setError('网络错误，请稍后重试')
 } finally {
 setDeleting(false)
 setShowDeleteConfirm(false)
 }
 }

 const canEditOrDelete =
 !!user &&
 !!solution &&
 (user.id === solution.authorId || canEditPerm)

 if (loading) {
 return (
 <div className="min-h-screen flex items-center justify-center">
 <div className="text-center">
 <div className="relative w-16 h-16 mx-auto mb-6">
 <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
 <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
 </div>
 <p className="text-muted-foreground text-lg">加载题解中...</p>
 </div>
 </div>
 )
 }

 if (notFound) {
 return (
 <div className="min-h-screen flex items-center justify-center">
 <div className="text-center card-static rounded-lg p-12 max-w-md">
 <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-6">
 <AlertCircle className="w-8 h-8 text-error" />
 </div>
 <p className="text-error text-lg mb-6">题解不存在</p>
 <button
 onClick={() => router.push(`/problem/${pid}`)}
 className="btn-primary btn"
 >
 返回题目
 </button>
 </div>
 </div>
 )
 }

 if (error || !solution) {
 return (
 <div className="min-h-screen flex items-center justify-center">
 <div className="text-center card-static rounded-lg p-12 max-w-md">
 <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-6">
 <AlertCircle className="w-8 h-8 text-error" />
 </div>
 <p className="text-error text-lg mb-6">{error || '题解加载失败'}</p>
 <button
 onClick={() => router.push(`/problem/${pid}`)}
 className="btn-primary btn"
 >
 返回题目
 </button>
 </div>
 </div>
 )
 }

 return (
 <div className="min-h-screen pb-8">
 <div className="container mx-auto px-4 pt-6 max-w-5xl">
 {/* 面包屑 */}
 <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-4 flex-wrap">
 <Link href="/problems" className="hover:text-primary-light transition-colors">
 题库
 </Link>
 <span className="opacity-50">/</span>
 <Link
 href={`/problem/${pid}`}
 className="hover:text-primary-light transition-colors max-w-[40ch] truncate"
 title={problem?.title}
 >
 {problem?.title || '题目'}
 </Link>
 <span className="opacity-50">/</span>
 <span
 className="text-foreground font-medium max-w-[40ch] truncate"
 title={solution.title}
 >
 {solution.title}
 </span>
 </nav>

 {/* 返回按钮 */}
 <button
 onClick={() => router.push(`/problem/${pid}`)}
 className="flex items-center gap-2 text-muted-foreground hover:text-primary-light mb-6 transition-colors group"
 >
 <ArrowLeft className="w-4 h-4 transition-transform duration-300 group-hover:-translate-x-1" />
 <span>返回题目</span>
 </button>

 {/* 元信息卡片 */}
 <div className="card-static rounded-lg p-6 md:p-8 mb-6">
 <div className="flex items-start gap-3 mb-5 flex-wrap">
 {solution.isOfficial && (
 <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-amber-400 to-yellow-500 text-amber-950 shadow-md shadow-amber-500/30">
 <span aria-hidden="true">⭐</span>
 <span>标程</span>
 </span>
 )}
 {solution.codeLanguage && (
 <span
 className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold text-white bg-gradient-to-r ${getLanguageGradient(
 solution.codeLanguage
 )} shadow-sm`}
 >
 <Code2 className="w-3.5 h-3.5" />
 {solution.codeLanguage}
 </span>
 )}
 </div>

 <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-5 leading-tight">
 {solution.title}
 </h1>

 <div className="flex items-center gap-4 flex-wrap">
 <Link
 href={`/user/${solution.author.id}`}
 className="flex items-center gap-2 hover:text-primary-light transition-colors group"
 >
 {solution.author.avatar ? (
 <img
 src={solution.author.avatar}
 alt={solution.author.nickname || solution.author.username}
 className="w-9 h-9 rounded-full object-cover"
 />
 ) : (
 <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary-light font-semibold text-sm">
 {getAuthorInitial(solution.author.nickname || solution.author.username)}
 </div>
 )}
 <div className="flex flex-col">
 <span className="text-foreground font-medium text-sm group-hover:text-primary-light transition-colors">
 {solution.author.nickname || solution.author.username}
 </span>
 <span className="text-xs text-muted-foreground">
 @{solution.author.username}
 </span>
 </div>
 </Link>

 <div className="h-8 w-px bg-border/50" />

 <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
 <Clock className="w-4 h-4" />
 {formatRelativeTime(solution.createdAt)}
 </span>
 <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
 <Eye className="w-4 h-4" />
 {solution.views} 阅读
 </span>
 </div>

 {/* 操作按钮区 */}
 <div className="flex items-center gap-3 mt-6 pt-6 border-t border-border flex-wrap">
 {canEditOrDelete && (
 <>
 <button
 onClick={() => router.push(`/problems/${pid}/solutions/${solution.id}/edit`)}
 className="btn-ghost btn flex items-center gap-2 group"
 aria-label="编辑"
 >
 <Edit className="w-4 h-4 transition-transform duration-300 group-hover:rotate-6" />
 <span>编辑</span>
 </button>
 <button
 onClick={() => setShowDeleteConfirm(true)}
 className="btn-ghost btn flex items-center gap-2 text-error hover:text-error group"
 aria-label="删除"
 >
 <Trash2 className="w-4 h-4 transition-transform duration-300 group-" />
 <span>删除</span>
 </button>
 </>
 )}
 </div>
 </div>

 {/* 题解正文 */}
 <div className="card-static rounded-lg p-6 md:p-8 mb-6">
 <div className="flex items-center gap-2 mb-5 pb-3 border-b border-border">
 <Sparkles className="w-5 h-5 text-primary-light" />
 <h2 className="text-lg font-semibold text-foreground">题解内容</h2>
 </div>
 <MarkdownRenderer content={solution.content || ''} preprocessContent={false} />
 </div>

 {/* 配套代码区域 */}
 {solution.code && (
 <div className="card-static rounded-lg p-6 md:p-8 mb-6">
 <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-border flex-wrap">
 <div className="flex items-center gap-2">
 <FileCode className="w-5 h-5 text-primary-light" />
 <h2 className="text-lg font-semibold text-foreground">参考代码</h2>
 </div>
 {solution.codeLanguage && (
 <span
 className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold text-white bg-gradient-to-r ${getLanguageGradient(
 solution.codeLanguage
 )} shadow-sm`}
 >
 <Code2 className="w-3.5 h-3.5" />
 {solution.codeLanguage}
 </span>
 )}
 </div>
 <pre className="bg-muted rounded-xl p-4 overflow-x-auto text-sm font-mono text-foreground border border-border hover:border-primary/30 transition-colors">
 <code>{solution.code}</code>
 </pre>
 </div>
 )}

 {/* 返回题目页按钮 */}
 <div className="flex justify-center mt-8">
 <button
 onClick={() => router.push(`/problem/${pid}`)}
 className="btn-primary btn flex items-center gap-2 group"
 >
 <ArrowLeft className="w-4 h-4 transition-transform duration-300 group-hover:-translate-x-1" />
 <span>返回题目</span>
 </button>
 </div>
 </div>

 {/* 删除确认弹窗 */}
 {showDeleteConfirm && (
 <div
 className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[110] animate-fadeIn"
 onClick={() => !deleting && setShowDeleteConfirm(false)}
 >
 <div
 className="card-static rounded-lg max-w-md w-full"
 onClick={(e) => e.stopPropagation()}
 >
 <div className="flex items-center justify-between px-6 py-4 border-b border-border">
 <h3 className="font-semibold text-foreground flex items-center gap-2">
 <AlertCircle className="w-5 h-5 text-error" />
 确认删除
 </h3>
 <button
 onClick={() => setShowDeleteConfirm(false)}
 disabled={deleting}
 className="p-2 rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
 aria-label="关闭"
 >
 <XCircle className="w-5 h-5 text-muted-foreground hover:text-foreground transition-colors" />
 </button>
 </div>
 <div className="p-6">
 <p className="text-foreground mb-2">
 确定要删除这篇题解吗？此操作不可恢复。
 </p>
 <p className="text-sm text-muted-foreground">
 标题：<span className="text-foreground">{solution.title}</span>
 </p>
 </div>
 <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
 <button
 onClick={() => setShowDeleteConfirm(false)}
 disabled={deleting}
 className="btn-ghost btn"
 >
 取消
 </button>
 <button
 onClick={handleDelete}
 disabled={deleting}
 className="btn flex items-center gap-2 bg-error text-white hover:bg-error/90 disabled:opacity-50"
 >
 {deleting ? (
 <>
 <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
 删除中...
 </>
 ) : (
 <>
 <Trash2 className="w-4 h-4" />
 确认删除
 </>
 )}
 </button>
 </div>
 </div>
 </div>
 )}
 </div>
 )
}
