'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useDeferredEffect } from '@/hooks/useDeferredEffect'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  FileText,
  User,
  Calendar,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Code,
  Clock,
  Filter,
  X,
  Eye,
  Search,
  Shield,
} from 'lucide-react'
import { formatTime, formatMemory, formatDateTime } from '@/lib/utils'
import { getStatusText } from '@/lib/status'
import {
  isAcceptedStatus,
  isNonFinalSubmissionStatus,
  NON_FINAL_STATUS_QUERY,
  SubmissionStatus,
} from '@/lib/constants/submission-status'
import { fetchWithCookie } from '@/lib/api/base'
import { useUser } from '@/contexts/UserContext'
import { EducationalPageShell, PageLoading, RouteSuspenseFallback } from '@/components/common'
import { loginPath } from '@/lib/navigation'
import { canAccessAdmin } from '@/lib/permissions'

interface Submission {
  id: string
  problem: {
    id: string
    title: string
    problemNumber?: string
  }
  user: {
    id: string
    username: string
    nickname: string
  }
  language: string
  status: string
  score: number
  time: number
  memory: number
  submittedAt: string
  code?: string
  message?: string
  passedTests?: number
  totalTests?: number
  isLate?: boolean
}

const STATUS_GROUPS: { key: string; label: string; status: string }[] = [
  { key: 'all', label: '全部', status: '' },
  { key: 'ac', label: '通过', status: 'AC' },
  { key: 'failed', label: '失败', status: 'WA,TLE,MLE,CE,RE' },
  { key: 'pending', label: '等待', status: NON_FINAL_STATUS_QUERY },
]

const LANGUAGES = [
  { value: '', label: '全部语言' },
  { value: 'cpp', label: 'C++' },
  { value: 'c', label: 'C' },
  { value: 'python', label: 'Python' },
]

function statusGroupFromParam(status: string | null): string {
  if (!status) return 'all'
  const hit = STATUS_GROUPS.find((g) => g.status === status)
  return hit?.key ?? 'all'
}

function SubmissionsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user, isLoading: userLoading } = useUser()
  const isAdmin = canAccessAdmin(user)

  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null)

  const problemId = searchParams.get('problemId')
  const userId = searchParams.get('userId')
  const statusParam = searchParams.get('status')
  const assignmentId = searchParams.get('assignmentId')
  const classId = searchParams.get('classId')

  const [statusGroup, setStatusGroup] = useState(() => statusGroupFromParam(statusParam))
  const [language, setLanguage] = useState('')
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')

  const requiresAuth = !assignmentId || !classId

  useEffect(() => {
    if (userLoading) return
    if (requiresAuth && !user) {
      router.replace(loginPath('/submissions?' + searchParams.toString()))
    }
  }, [userLoading, user, requiresAuth, router, searchParams])

  useEffect(() => {
    const t = window.setTimeout(() => {
      setKeyword(keywordInput.trim())
      setPage(1)
    }, 350)
    return () => window.clearTimeout(t)
  }, [keywordInput])

  const fetchSubmissions = useCallback(async () => {
    try {
      setLoading(true)
      const group = STATUS_GROUPS.find((g) => g.key === statusGroup)
      const apiStatus = group?.status || statusParam || ''

      let response: Response
      if (assignmentId && classId) {
        const params = new URLSearchParams({
          page: page.toString(),
          limit: '20',
        })
        if (problemId) params.set('problemId', problemId)
        if (userId) params.set('userId', userId)
        if (apiStatus) params.set('status', apiStatus)
        response = await fetchWithCookie(
          `/api/classes/${classId}/assignments/${assignmentId}/submissions?${params}`
        )
      } else {
        const params = new URLSearchParams({
          page: page.toString(),
          limit: '20',
        })
        if (problemId) params.set('problemId', problemId)
        if (userId) params.set('userId', userId)
        if (apiStatus) params.set('status', apiStatus)
        if (language) params.set('language', language)
        if (isAdmin && keyword) params.set('keyword', keyword)
        response = await fetchWithCookie(`/api/submissions?${params}`)
      }

      const data = await response.json()
      if (data.success) {
        setSubmissions(data.data.submissions || [])
        const pag = data.data.pagination
        setTotal(pag?.total ?? 0)
        setTotalPages(pag?.totalPages || Math.ceil((pag?.total || 0) / 20) || 1)
      } else {
        setSubmissions([])
        setTotal(0)
        setTotalPages(1)
      }
    } catch {
      setSubmissions([])
      setTotal(0)
      setTotalPages(1)
    } finally {
      setLoading(false)
    }
  }, [
    page,
    problemId,
    userId,
    statusParam,
    statusGroup,
    language,
    keyword,
    assignmentId,
    classId,
    isAdmin,
  ])

  useDeferredEffect(() => {
    if (userLoading) return
    if (requiresAuth && !user) return
    void fetchSubmissions()
  }, [fetchSubmissions, user, userLoading, requiresAuth])

  const getStatusBadge = (status: string) => {
    const text = getStatusText(status)
    if (isAcceptedStatus(status)) {
      return (
        <span className="tag tag-success">
          <CheckCircle className="w-3 h-3" />
          {text}
        </span>
      )
    }
    if (status === SubmissionStatus.WRONG_ANSWER) {
      return (
        <span className="tag tag-error">
          <XCircle className="w-3 h-3" />
          {text}
        </span>
      )
    }
    if (isNonFinalSubmissionStatus(status)) {
      return (
        <span className="tag tag-info">
          <Clock className="w-3 h-3" />
          {text}
        </span>
      )
    }
    return (
      <span className="tag tag-warning">
        <AlertTriangle className="w-3 h-3" />
        {text}
      </span>
    )
  }

  const clearContextFilters = () => {
    setStatusGroup('all')
    setLanguage('')
    setKeywordInput('')
    setKeyword('')
    setPage(1)
    router.push('/submissions')
  }

  const hasContextFilter = !!(problemId || userId || statusParam || assignmentId)
  const hasLocalFilter = statusGroup !== 'all' || !!language || !!keyword
  const activeFilterCount =
    (statusGroup !== 'all' ? 1 : 0) + (language ? 1 : 0) + (keyword ? 1 : 0) + (problemId ? 1 : 0) + (userId ? 1 : 0)

  if (userLoading || (requiresAuth && !user)) {
    return <PageLoading label="加载中..." />
  }

  const backHref =
    assignmentId && classId
      ? `/classes/${classId}/assignments/${assignmentId}`
      : undefined

  return (
    <EducationalPageShell
      title={isAdmin && !assignmentId ? '全站提交记录' : '提交记录'}
      icon={FileText}
      width="workspace"
      backHref={backHref}
      backLabel="返回作业"
      toolbar={
        <div className="space-y-3">
          <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
            {isAdmin && !assignmentId && (
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="search"
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  placeholder="搜索用户名、题目名或题号…"
                  className="input pl-9 w-full"
                />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex gap-1 p-1 rounded-lg bg-muted">
                {STATUS_GROUPS.map((group) => (
                  <button
                    key={group.key}
                    type="button"
                    onClick={() => {
                      setStatusGroup(group.key)
                      setPage(1)
                    }}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      statusGroup === group.key
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {group.label}
                  </button>
                ))}
              </div>
              <select
                value={language}
                onChange={(e) => {
                  setLanguage(e.target.value)
                  setPage(1)
                }}
                className="input py-1.5 text-sm w-auto min-w-[7.5rem]"
                aria-label="语言筛选"
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang.value || 'all'} value={lang.value}>
                    {lang.label}
                  </option>
                ))}
              </select>
              {(hasContextFilter || hasLocalFilter) && (
                <button
                  type="button"
                  onClick={clearContextFilters}
                  className="btn btn-ghost text-sm gap-1"
                >
                  <X className="w-4 h-4" />
                  清除筛选
                  {activeFilterCount > 0 && (
                    <span className="text-xs text-muted-foreground">({activeFilterCount})</span>
                  )}
                </button>
              )}
            </div>
          </div>

          {(hasContextFilter || isAdmin) && (
            <div className="flex items-center gap-2 flex-wrap text-sm text-muted-foreground">
              {isAdmin && !assignmentId && (
                <span className="tag tag-primary inline-flex items-center gap-1">
                  <Shield className="w-3 h-3" />
                  管理员视图 · 全站
                </span>
              )}
              {assignmentId && (
                <span className="tag tag-primary inline-flex items-center gap-1">
                  <Filter className="w-3 h-3" />
                  班级作业提交
                </span>
              )}
              {problemId && submissions[0]?.problem && (
                <span className="tag">题目：{submissions[0].problem.title}</span>
              )}
              {userId && submissions[0]?.user && (
                <span className="tag inline-flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {submissions[0].user.nickname || submissions[0].user.username}
                </span>
              )}
              <span className="ml-auto tabular-nums">共 {total} 条</span>
            </div>
          )}
        </div>
      }
    >
      <div className="card-static overflow-hidden rounded-lg border border-border animate-fadeIn">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px]">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="px-4 py-2.5 text-left text-sm font-semibold text-muted-foreground">提交ID</th>
                <th className="px-4 py-2.5 text-left text-sm font-semibold text-muted-foreground">题目</th>
                <th className="px-4 py-2.5 text-left text-sm font-semibold text-muted-foreground">用户</th>
                <th className="px-4 py-2.5 text-left text-sm font-semibold text-muted-foreground">状态</th>
                <th className="px-4 py-2.5 text-left text-sm font-semibold text-muted-foreground">分数</th>
                <th className="px-4 py-2.5 text-left text-sm font-semibold text-muted-foreground">语言</th>
                <th className="px-4 py-2.5 text-left text-sm font-semibold text-muted-foreground">用时 · 内存</th>
                <th className="px-4 py-2.5 text-left text-sm font-semibold text-muted-foreground">提交时间</th>
                <th className="px-4 py-2.5 text-left text-sm font-semibold text-muted-foreground">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-3"><div className="h-4 w-16 rounded bg-muted" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-36 rounded bg-muted" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-20 rounded bg-muted" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-20 rounded-full bg-muted" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-8 rounded bg-muted" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-12 rounded bg-muted" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-24 rounded bg-muted" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-28 rounded bg-muted" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-8 rounded bg-muted" /></td>
                  </tr>
                ))
              ) : submissions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center">
                    <FileText className="w-12 h-12 mx-auto mb-3 text-muted-foreground/25" />
                    <p className="text-base font-medium text-foreground mb-1">没有找到提交记录</p>
                    <p className="text-sm text-muted-foreground">
                      {hasLocalFilter || hasContextFilter
                        ? '试试调整筛选条件'
                        : isAdmin
                          ? '全站暂无提交'
                          : '提交代码后会出现在这里'}
                    </p>
                  </td>
                </tr>
              ) : (
                submissions.map((submission) => (
                  <tr key={submission.id} className="hover:bg-muted/60 transition-colors">
                    <td className="px-4 py-2.5">
                      <code className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                        {submission.id.slice(0, 8)}
                      </code>
                    </td>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/problem/${submission.problem.id}`}
                        className="text-primary-light hover:text-primary transition-colors"
                      >
                        {submission.problem.problemNumber && (
                          <span className="text-muted-foreground font-mono text-xs mr-1.5">
                            {submission.problem.problemNumber}
                          </span>
                        )}
                        {submission.problem.title}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/user/${submission.user.id}`}
                        className="text-foreground hover:text-primary-light transition-colors inline-flex items-center gap-1"
                      >
                        <User className="w-4 h-4 text-muted-foreground shrink-0" />
                        {submission.user.nickname || submission.user.username}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5" title={getStatusText(submission.status)}>
                      {getStatusBadge(submission.status)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-mono font-semibold tabular-nums text-foreground">
                        {submission.score}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="tag">{submission.language}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-sm text-foreground tabular-nums">
                        {formatTime(submission.time ?? 0)} · {formatMemory(submission.memory ?? 0)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-sm text-muted-foreground inline-flex items-center gap-1 whitespace-nowrap">
                        <Calendar className="w-3 h-3 shrink-0" />
                        {formatDateTime(submission.submittedAt)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {assignmentId ? (
                        <button
                          type="button"
                          onClick={() => setSelectedSubmission(submission)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-primary-light hover:bg-muted transition-colors cursor-pointer"
                          title="查看详情"
                          aria-label="查看详情"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      ) : (
                        <Link
                          href={
                            isAdmin
                              ? `/admin/submissions/${submission.id}`
                              : `/submission/${submission.id}`
                          }
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-primary-light hover:bg-muted transition-colors inline-flex"
                          title="查看详情"
                          aria-label="查看详情"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && totalPages >= 1 && total > 0 && (
          <div className="px-4 py-3 border-t border-border flex flex-wrap justify-between items-center gap-3">
            <span className="text-sm text-muted-foreground tabular-nums">
              第 {page} / {Math.max(totalPages, 1)} 页 · 共 {total} 条
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="btn btn-outline py-1.5 px-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                上一页
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="btn btn-outline py-1.5 px-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedSubmission && assignmentId && (
        <div
          className="fixed inset-0 bg-background/80 flex items-center justify-center p-4 z-[110]"
          onClick={() => setSelectedSubmission(null)}
        >
          <div
            className="card-static rounded-lg max-w-3xl w-full max-h-[90vh] overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-2.5 border-b border-border bg-muted flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                提交详情
              </h3>
              <button
                type="button"
                onClick={() => setSelectedSubmission(null)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="关闭"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)] custom-scrollbar">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="rounded-lg border border-border p-4">
                  <p className="text-sm text-muted-foreground mb-1">提交用户</p>
                  <p className="font-medium text-foreground flex items-center gap-2">
                    <User className="w-4 h-4 text-primary" />
                    {selectedSubmission.user.nickname || selectedSubmission.user.username}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <p className="text-sm text-muted-foreground mb-1">题目</p>
                  <p className="font-medium text-foreground">{selectedSubmission.problem.title}</p>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <p className="text-sm text-muted-foreground mb-1">语言</p>
                  <span className="tag">{selectedSubmission.language}</span>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <p className="text-sm text-muted-foreground mb-1">状态</p>
                  {getStatusBadge(selectedSubmission.status)}
                </div>
                <div className="rounded-lg border border-border p-4">
                  <p className="text-sm text-muted-foreground mb-1">得分</p>
                  <p className="font-medium text-foreground">
                    <span className="text-2xl font-bold tabular-nums">{selectedSubmission.score}</span>
                    {selectedSubmission.passedTests !== undefined &&
                      selectedSubmission.totalTests !== undefined && (
                        <span className="text-sm text-muted-foreground ml-2">
                          ({selectedSubmission.passedTests}/{selectedSubmission.totalTests} 通过)
                        </span>
                      )}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <p className="text-sm text-muted-foreground mb-1">提交时间</p>
                  <p className="font-medium text-foreground flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    {formatDateTime(selectedSubmission.submittedAt)}
                  </p>
                </div>
              </div>

              {selectedSubmission.code && (
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Code className="w-5 h-5 text-primary" />
                    <h4 className="font-semibold text-foreground">代码</h4>
                  </div>
                  <div className="bg-background-secondary rounded-lg overflow-hidden border border-border">
                    <div className="px-4 py-2 bg-muted text-muted-foreground text-sm border-b border-border">
                      {selectedSubmission.language}
                    </div>
                    <pre className="p-4 overflow-x-auto max-h-80 custom-scrollbar">
                      <code className="text-foreground text-sm font-mono">{selectedSubmission.code}</code>
                    </pre>
                  </div>
                </div>
              )}

              {selectedSubmission.message && (
                <div>
                  <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-error" />
                    错误信息
                  </h4>
                  <div className="bg-error/10 border border-error/20 rounded-lg p-4">
                    <pre className="text-sm text-error whitespace-pre-wrap">{selectedSubmission.message}</pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </EducationalPageShell>
  )
}

export default function SubmissionsPage() {
  return (
    <Suspense fallback={<RouteSuspenseFallback label="加载中..." />}>
      <SubmissionsContent />
    </Suspense>
  )
}
