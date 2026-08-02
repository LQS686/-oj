'use client'

import { useState, Suspense, useCallback } from 'react'
import { useDeferredEffect } from '@/hooks/useDeferredEffect'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
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
  Flag,
  ShieldAlert,
} from 'lucide-react'
import { useUser } from '@/contexts/UserContext'
import { fetchWithCookie } from '@/lib/api/base'
import { formatRelativeTime } from '@/lib/utils'
import { canManageContent } from '@/lib/permissions'
import MarkdownRenderer from '@/components/common/MarkdownRenderer'
import { PageContainer } from '@/components/layout'
import CreateSolutionModal from '@/components/solution/CreateSolutionModal'
import ReportModal from '@/components/report/ReportModal'
import { RouteSuspenseFallback } from '@/components/common'
import { useDialog } from '@/components/common/DialogProvider'

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
  status?: string
  reviewNote?: string | null
  createdAt: string
  updatedAt: string
  author: {
    id: string
    username: string
    nickname?: string
    avatar?: string | null
  }
}

const SOLUTION_STATUS_TEXT: Record<string, string> = {
  pending: '这篇题解正在审核中，审核通过后将对其他用户可见',
  rejected: '这篇题解未通过审核，请根据提示修改后重新提交',
  hidden: '这篇题解已被管理员下架，其他用户不可见',
}

interface ProblemSummary {
  id: string
  title: string
  problemNumber?: string
}

function getAuthorInitial(name?: string): string {
  if (!name) return '?'
  return name.charAt(0).toUpperCase()
}

function SolutionDetailPageContent() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useUser()
  const dialog = useDialog()

  const pid = (params?.id as string) || ''
  const sid = (params?.solutionId as string) || ''

  const [solution, setSolution] = useState<SolutionDetail | null>(null)
  const [problem, setProblem] = useState<ProblemSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [canEditPerm, setCanEditPerm] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)

  const fetchSolution = useCallback(async () => {
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
        setError(data?.error?.message || data?.error || '获取题解失败')
        return
      }

      setSolution(data.data as SolutionDetail)
    } catch {
      setError('网络错误，请稍后重试')
    } finally {
      setLoading(false)
    }
  }, [sid])

  const fetchProblem = useCallback(async () => {
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
  }, [pid])

  useDeferredEffect(() => {
    if (!pid || !sid) return
    void fetchSolution()
    void fetchProblem()
  }, [pid, sid, fetchSolution, fetchProblem])

  useDeferredEffect(() => {
    if (searchParams.get('edit') === '1') {
      setEditOpen(true)
      router.replace(`/problems/${pid}/solutions/${sid}`, { scroll: false })
    }
  }, [searchParams, router, pid, sid])

  useDeferredEffect(() => {
    if (!user) {
      setCanEditPerm(false)
      return
    }
    setCanEditPerm(canManageContent(user))
  }, [user])

  const handleDelete = async () => {
    if (!solution) return
    const confirmed = await dialog.confirm({
      tone: 'error',
      title: '删除题解',
      message: `确定删除「${solution.title}」？此操作不可恢复。`,
      confirmText: '删除',
      confirmVariant: 'destructive',
    })
    if (!confirmed) return

    try {
      setDeleting(true)
      const response = await fetchWithCookie(`/api/solutions/${solution.id}`, {
        method: 'DELETE',
      })
      const data = await response.json().catch(() => null)
      if (data?.success) {
        router.push(`/problem/${pid}?tab=solutions`)
      } else {
        await dialog.alert({
          tone: 'error',
          message: data?.error?.message || data?.error || '删除失败',
        })
      }
    } catch {
      await dialog.alert({ tone: 'error', message: '网络错误，请稍后重试' })
    } finally {
      setDeleting(false)
    }
  }

  const canEditOrDelete =
    !!user && !!solution && (user.id === solution.authorId || canEditPerm)

  const problemLabel = problem
    ? [problem.problemNumber, problem.title].filter(Boolean).join(' ')
    : '题目'
  const problemHref = `/problem/${pid}`
  const solutionsTabHref = `/problem/${pid}?tab=solutions`

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 mx-auto mb-4 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          <p className="text-muted-foreground text-sm">加载题解…</p>
        </div>
      </div>
    )
  }

  if (notFound || error || !solution) {
    return (
      <PageContainer variant="standard" className="pt-10 pb-16">
        <div className="card-static rounded-xl p-10 text-center max-w-md mx-auto">
          <div className="w-14 h-14 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-7 h-7 text-error" />
          </div>
          <p className="text-foreground font-medium mb-2">
            {notFound ? '题解不存在' : error || '题解加载失败'}
          </p>
          <Link href={problemHref} className="btn btn-primary btn-sm mt-4 inline-flex">
            返回题目
          </Link>
        </div>
      </PageContainer>
    )
  }

  return (
    <div className="min-h-screen pb-12">
      <PageContainer variant="standard" className="pt-5">
        {/* 顶栏：返回 + 精简路径 */}
        <div className="flex items-center gap-3 mb-5 text-sm">
          <Link
            href={problemHref}
            className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>题目</span>
          </Link>
          <span className="text-border">/</span>
          <Link
            href={solutionsTabHref}
            className="text-muted-foreground hover:text-foreground transition-colors truncate max-w-[28ch]"
            title={problemLabel}
          >
            题解
          </Link>
          <span className="text-border">/</span>
          <span className="text-foreground font-medium truncate" title={solution.title}>
            {solution.title}
          </span>
        </div>

        {/* 文章主体：单卡片阅读流 */}
        <article className="card-static rounded-xl overflow-hidden">
          <header className="px-5 sm:px-8 pt-6 sm:pt-8 pb-5 border-b border-border/80">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  {solution.isOfficial && (
                    <span className="tag tag-warning text-xs">标程</span>
                  )}
                  {solution.codeLanguage && (
                    <span className="tag tag-info text-xs inline-flex items-center gap-1">
                      <Code2 className="w-3 h-3" />
                      {solution.codeLanguage}
                    </span>
                  )}
                  <Link
                    href={problemHref}
                    className="inline-flex items-center max-w-full truncate text-xs px-2 py-0.5 rounded-md border border-border text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
                    title={problemLabel}
                  >
                    {problem?.problemNumber || '题目'} · {problem?.title || '查看原题'}
                  </Link>
                </div>

                <h1 className="text-xl sm:text-2xl font-bold text-foreground leading-snug tracking-tight">
                  {solution.title}
                </h1>
              </div>

              {canEditOrDelete && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditOpen(true)}
                    className="btn btn-ghost btn-sm inline-flex items-center gap-1.5"
                    aria-label="编辑题解"
                  >
                    <Edit className="w-4 h-4" />
                    <span className="hidden sm:inline">编辑</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete()}
                    disabled={deleting}
                    className="btn btn-ghost btn-sm inline-flex items-center gap-1.5 text-error hover:text-error"
                    aria-label="删除题解"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="hidden sm:inline">{deleting ? '删除中…' : '删除'}</span>
                  </button>
                </div>
              )}
              {!!user && !canEditOrDelete && (
                <button
                  type="button"
                  onClick={() => setReportOpen(true)}
                  className="btn btn-ghost btn-sm inline-flex items-center gap-1.5 text-muted-foreground hover:text-error shrink-0"
                  aria-label="举报题解"
                  title="举报违规内容"
                >
                  <Flag className="w-4 h-4" />
                  <span className="hidden sm:inline">举报</span>
                </button>
              )}
            </div>

            {solution.status && solution.status !== 'approved' && (
              <div className="mt-4 flex items-start gap-2 rounded-lg bg-warning/10 border border-warning/20 px-3 py-2.5 text-sm text-warning">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p>{SOLUTION_STATUS_TEXT[solution.status] || '该题解当前不可对他人公开'}</p>
                  {solution.reviewNote && (
                    <p className="mt-0.5 text-warning/80">审核备注：{solution.reviewNote}</p>
                  )}
                </div>
              </div>
            )}

            <div className="mt-5 flex items-center gap-3 flex-wrap text-sm text-muted-foreground">
              <Link
                href={`/user/${solution.author.id}`}
                className="inline-flex items-center gap-2 hover:text-foreground transition-colors"
              >
                {solution.author.avatar ? (
                  <img
                    src={solution.author.avatar}
                    alt=""
                    className="w-8 h-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-semibold">
                    {getAuthorInitial(solution.author.nickname || solution.author.username)}
                  </div>
                )}
                <span className="text-foreground font-medium">
                  {solution.author.nickname || solution.author.username}
                </span>
              </Link>
              <span className="text-border hidden sm:inline">·</span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                {formatRelativeTime(solution.createdAt)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" />
                {solution.views} 阅读
              </span>
            </div>
          </header>

          <div className="px-5 sm:px-8 py-6 sm:py-8">
            <MarkdownRenderer
              content={solution.content || ''}
              className="solution-article"
            />
          </div>

          {solution.code && (
            <section className="px-5 sm:px-8 pb-6 sm:pb-8">
              <div className="rounded-xl border border-border bg-muted/30 overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border/80 bg-muted/50">
                  <div className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                    <FileCode className="w-4 h-4 text-primary" />
                    附件代码
                  </div>
                  {solution.codeLanguage && (
                    <span className="text-xs text-muted-foreground uppercase tracking-wide">
                      {solution.codeLanguage}
                    </span>
                  )}
                </div>
                <pre className="p-4 overflow-x-auto text-sm font-mono text-foreground leading-relaxed bg-muted/20">
                  <code>{solution.code}</code>
                </pre>
              </div>
            </section>
          )}
        </article>

        <footer className="mt-6 text-sm">
          <Link
            href={solutionsTabHref}
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            回到题目题解
          </Link>
        </footer>
      </PageContainer>

      <CreateSolutionModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        problemId={pid}
        solutionId={sid}
        onSaved={() => {
          void fetchSolution()
        }}
      />

      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="SOLUTION"
        targetId={sid}
        targetTitle={solution.title}
      />
    </div>
  )
}

export default function SolutionDetailPage() {
  return (
    <Suspense fallback={<RouteSuspenseFallback label="加载中..." />}>
      <SolutionDetailPageContent />
    </Suspense>
  )
}
