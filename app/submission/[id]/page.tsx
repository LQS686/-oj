'use client'

import { use, useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Clock,
  Database,
  User,
  Calendar,
  Code,
  CheckCircle,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  History,
  Target,
  Loader2,
  Download,
} from 'lucide-react'
import { formatTime, formatMemory, formatDateTime } from '@/lib/utils'
import { getStatusText, getDifficultyClass } from '@/lib/status'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useSubmissionSocket } from '@/hooks/useSubmissionSocket'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { fetchWithCookie } from '@/lib/api/base'
import { PageContainer } from '@/components/layout'
import CodeEditor, { type CodeLanguage } from '@/components/code-editor/CodeEditor'
import {
  isAcceptedStatus,
  isCompileErrorStatus,
  isFinalSubmissionStatus,
  isNonFinalSubmissionStatus,
  SubmissionStatus,
} from '@/lib/constants/submission-status'
import { downloadFirstWaTestCase, findFirstWaIndex } from '@/lib/submission/wa-download'

interface TestResult {
  testId: string
  status: string
  time: number
  memory: number
  message?: string
}

interface Submission {
  id: string
  problem: {
    id: string
    problemNumber?: string
    title: string
    difficulty: string
  }
  user: {
    id: string
    username: string
    nickname?: string
  }
  language: string
  code: string
  status: string
  score: number
  time: number
  memory: number
  passedTests: number
  totalTests: number
  message?: string
  testResults?: TestResult[]
  submittedAt: string
}

interface SubmissionHistoryItem {
  id: string
  status: string
  score: number
  time: number
  memory: number
  submittedAt: string
  language: string
}

function isFinalStatus(status: string | undefined | null): boolean {
  if (!status) return false
  return isFinalSubmissionStatus(status)
}

function toCodeLanguage(lang: string): CodeLanguage {
  if (lang === 'c' || lang === 'python') return lang
  return 'cpp'
}

function getTestStatusIcon(status: string, className = 'w-4 h-4') {
  switch (status) {
    case SubmissionStatus.ACCEPTED:
      return <CheckCircle className={`${className} text-secondary`} />
    case SubmissionStatus.WRONG_ANSWER:
      return <XCircle className={`${className} text-error`} />
    case SubmissionStatus.TIME_LIMIT_EXCEEDED:
      return <Clock className={`${className} text-accent`} />
    case SubmissionStatus.MEMORY_LIMIT_EXCEEDED:
      return <Database className={`${className} text-info`} />
    case SubmissionStatus.RUNTIME_ERROR:
      return <AlertTriangle className={`${className} text-warning`} />
    case SubmissionStatus.COMPILE_ERROR:
      return <Code className={`${className} text-muted-foreground`} />
    case SubmissionStatus.PARTLY_CORRECT:
      return <CheckCircle2 className={`${className} text-[var(--difficulty-medium)]`} />
    default:
      return <AlertTriangle className={`${className} text-muted-foreground`} />
  }
}

function StatusBadge({ status }: { status: string }) {
  const text = getStatusText(status)
  if (isNonFinalSubmissionStatus(status)) {
    return (
      <span className="tag tag-info">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        {text}
      </span>
    )
  }
  if (isAcceptedStatus(status)) {
    return (
      <span className="tag tag-success">
        <CheckCircle className="w-3.5 h-3.5" />
        {text}
      </span>
    )
  }
  if (status === SubmissionStatus.WRONG_ANSWER) {
    return (
      <span className="tag tag-error">
        <XCircle className="w-3.5 h-3.5" />
        {text}
      </span>
    )
  }
  return (
    <span className="tag tag-warning">
      <AlertTriangle className="w-3.5 h-3.5" />
      {text}
    </span>
  )
}

function TestPointRow({
  result,
  index,
  canDownloadWa,
  downloading,
  onDownloadWa,
}: {
  result: TestResult
  index: number
  canDownloadWa?: boolean
  downloading?: boolean
  onDownloadWa?: () => void
}) {
  const isPass = isAcceptedStatus(result.status)
  const judging = isNonFinalSubmissionStatus(result.status)
  const hasMessage = !!result.message
  const [expanded, setExpanded] = useState(!isPass && hasMessage)

  return (
    <div
      className={`rounded-lg border ${
        isPass
          ? 'border-secondary/25 bg-secondary/5'
          : judging
            ? 'border-border bg-muted/40'
            : 'border-error/25 bg-error/5'
      }`}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="flex-1 min-w-0 flex items-center justify-between gap-3 px-3 py-2 text-left"
          onClick={() => hasMessage && setExpanded((v) => !v)}
          disabled={!hasMessage}
        >
          <div className="flex items-center gap-2 min-w-0">
            {judging ? (
              <Loader2 className="w-4 h-4 text-muted-foreground animate-spin shrink-0" />
            ) : (
              getTestStatusIcon(result.status)
            )}
            <span className="text-sm font-medium text-foreground">#{index + 1}</span>
            <span className="text-xs text-muted-foreground truncate">{getStatusText(result.status)}</span>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono tabular-nums text-muted-foreground shrink-0">
            <span>{judging ? '—' : formatTime(result.time)}</span>
            <span>{judging ? '—' : formatMemory(result.memory)}</span>
            {hasMessage &&
              (expanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              ))}
          </div>
        </button>
        {canDownloadWa && (
          <button
            type="button"
            className="shrink-0 mr-2 btn btn-outline text-xs py-1 px-2 gap-1"
            disabled={downloading}
            onClick={() => onDownloadWa?.()}
            title="下载第一个 WA 测试点"
          >
            {downloading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            下载
          </button>
        )}
      </div>
      {expanded && result.message && (
        <pre className="mx-3 mb-2.5 text-xs text-muted-foreground whitespace-pre-wrap bg-muted/80 border border-border rounded-md p-2 max-h-40 overflow-auto custom-scrollbar">
          {result.message}
        </pre>
      )}
    </div>
  )
}

export default function SubmissionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { user } = useCurrentUser()
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submissionHistory, setSubmissionHistory] = useState<SubmissionHistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [waDownloading, setWaDownloading] = useState(false)
  const [waDownloadError, setWaDownloadError] = useState('')
  const isRefreshingRef = useRef(false)

  const submissionTabTitle = submission?.problem?.title
    ? `${submission.problem.title} - 提交`
    : submission
      ? '提交详情'
      : undefined
  useDocumentTitle(submissionTabTitle)

  const fetchSubmission = useCallback(async () => {
    if (isRefreshingRef.current) return
    isRefreshingRef.current = true
    try {
      const response = await fetchWithCookie(`/api/submissions/${id}`)
      const data = await response.json()

      if (data.success) {
        setSubmission(data.data)
      } else {
        if (response.status === 404) {
          setSubmission((prev) => {
            if (!prev) setError('提交记录不存在或已被删除。')
            return prev
          })
        } else {
          setError(data.error || '加载失败')
        }
      }
    } catch (err) {
      console.error('获取提交详情失败:', err)
      setSubmission((prev) => {
        if (!prev) setError('网络错误，请稍后重试')
        return prev
      })
    } finally {
      setLoading(false)
      isRefreshingRef.current = false
    }
  }, [id])

  useEffect(() => {
    fetchSubmission()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useSubmissionSocket({
    userId: user?.id || '',
    enabled: !!user,
    onConnected: () => {
      fetchSubmission()
    },
    onSubmissionUpdate: (data) => {
      if (data.id !== id) return
      setSubmission((prev) => {
        if (!prev) return prev
        if (isFinalStatus(prev.status) && !isFinalStatus(data.status)) {
          return prev
        }
        return {
          ...prev,
          status: data.status,
          score: data.score ?? prev.score,
          time: data.time ?? prev.time,
          memory: data.memory ?? prev.memory,
          passedTests: data.passedTests ?? prev.passedTests,
          totalTests: data.totalTests ?? prev.totalTests,
          message: data.message ?? prev.message,
          testResults:
            Array.isArray(data.testResults) && data.testResults.length > 0
              ? data.testResults
              : prev.testResults,
        }
      })
    },
    onJudgeProgress: (data) => {
      if (data.submissionId !== id) return
      setSubmission((prev) => {
        if (!prev) return prev
        if (isFinalStatus(prev.status)) return prev
        return {
          ...prev,
          status: isNonFinalSubmissionStatus(data.status) ? data.status : prev.status,
          totalTests: data.totalTests || prev.totalTests,
        }
      })
    },
  })

  useEffect(() => {
    if (submission) {
      void fetchSubmissionHistory()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submission?.id])

  const fetchSubmissionHistory = async () => {
    if (!submission) return

    try {
      setHistoryLoading(true)
      const response = await fetchWithCookie(`/api/problems/${submission.problem.id}/submissions`)
      const data = await response.json()

      if (data.success) {
        setSubmissionHistory(
          Array.isArray(data.data.submissions) ? data.data.submissions.slice(0, 10) : []
        )
      } else {
        setSubmissionHistory([])
      }
    } catch (err) {
      console.error('获取提交历史失败:', err)
    } finally {
      setHistoryLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-12 h-12 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin" />
          </div>
          <p className="text-sm text-muted-foreground">加载中…</p>
        </div>
      </div>
    )
  }

  if (error || !submission) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center px-4">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-error/10 flex items-center justify-center">
            <XCircle className="w-7 h-7 text-error" />
          </div>
          <h2 className="text-lg font-bold text-foreground mb-2">加载失败</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-md">{error}</p>
          <button type="button" onClick={() => router.back()} className="btn btn-primary">
            返回
          </button>
        </div>
      </div>
    )
  }

  const handleCopyCode = async () => {
    if (!submission.code) return
    await navigator.clipboard.writeText(submission.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isAc = isAcceptedStatus(submission.status)
  const isCe = isCompileErrorStatus(submission.status)
  const judging = isNonFinalSubmissionStatus(submission.status)
  const problemHref = `/problem/${submission.problem.problemNumber || submission.problem.id}`
  const codeLines = submission.code ? submission.code.split('\n').length : 0
  const showTests =
    judging || !!(submission.testResults && submission.testResults.length > 0)
  const firstWaIndex = findFirstWaIndex(submission.testResults)
  const canDownloadWa =
    firstWaIndex >= 0 &&
    !!user &&
    (submission.user.id === user.id ||
      user.role === 'SYSTEM_ADMIN' ||
      user.role === 'ADMIN')

  const handleDownloadWa = async () => {
    if (waDownloading) return
    setWaDownloadError('')
    setWaDownloading(true)
    try {
      await downloadFirstWaTestCase(submission.id)
    } catch (err) {
      setWaDownloadError(err instanceof Error ? err.message : '下载失败')
    } finally {
      setWaDownloading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <PageContainer variant="standard" className="py-5 md:py-6 pb-10">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => router.push('/submissions')}
            className="btn btn-outline text-sm py-1.5 px-3 gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            提交记录
          </button>
          <Link href={problemHref} className="btn btn-primary text-sm py-1.5 px-3 gap-1.5">
            返回题目
          </Link>
          {judging && (
            <span className="ml-auto inline-flex items-center gap-1.5 text-primary text-xs">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              评测中，结果会自动更新
            </span>
          )}
        </div>

        <header className="mb-4">
          <div className="flex flex-wrap items-center gap-2.5 mb-2">
            <h1 className="text-xl font-bold text-foreground min-w-0">
              {submission.problem.problemNumber && (
                <span className="font-mono text-muted-foreground mr-1.5 text-base">
                  {submission.problem.problemNumber}
                </span>
              )}
              <Link href={problemHref} className="hover:text-primary transition-colors">
                {submission.problem.title}
              </Link>
            </h1>
            <StatusBadge status={submission.status} />
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <User className="w-3.5 h-3.5" />
              {submission.user.nickname || submission.user.username}
            </span>
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {formatDateTime(submission.submittedAt)}
            </span>
            <span className="tag">{submission.language}</span>
            <span className={`tag ${getDifficultyClass(submission.problem.difficulty)}`}>
              {submission.problem.difficulty}
            </span>
            <span className="hidden sm:inline text-border">·</span>
            <span className="font-mono tabular-nums text-foreground">
              {submission.score}
              <span className="text-muted-foreground font-sans ml-1">
                分 ({submission.passedTests}/{submission.totalTests})
              </span>
            </span>
            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
              <Clock className="w-3.5 h-3.5" />
              {formatTime(submission.time ?? 0)}
            </span>
            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
              <Database className="w-3.5 h-3.5" />
              {formatMemory(submission.memory ?? 0)}
            </span>
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded" title={submission.id}>
              {submission.id.slice(0, 8)}
            </code>
          </div>
        </header>

        {(submission.message || isCe) && (
          <div
            className={`mb-4 rounded-lg border p-3.5 flex gap-3 ${
              isCe || !isAc
                ? 'bg-error/5 border-error/25'
                : 'bg-accent/10 border-accent/25'
            }`}
          >
            <AlertTriangle
              className={`w-5 h-5 shrink-0 mt-0.5 ${isCe || !isAc ? 'text-error' : 'text-accent'}`}
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-foreground mb-1">
                {isCe ? '编译信息' : '评测信息'}
              </div>
              <pre className="text-sm text-muted-foreground whitespace-pre-wrap break-words max-h-48 overflow-auto custom-scrollbar">
                {submission.message || '（无详细信息）'}
              </pre>
            </div>
          </div>
        )}

        <div
          className={`grid grid-cols-1 gap-4 items-start ${
            showTests ? 'lg:grid-cols-[minmax(0,1fr)_16rem]' : ''
          }`}
        >
          <section className="card-static p-4 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Code className="w-4 h-4 text-primary" />
                提交代码
                <span className="text-xs font-normal text-muted-foreground">
                  {submission.language} · {codeLines} 行
                </span>
              </h2>
              <button
                type="button"
                onClick={() => void handleCopyCode()}
                className="btn btn-outline text-sm py-1.5 px-3 gap-1.5"
                disabled={!submission.code}
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" />
                    已复制
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    复制
                  </>
                )}
              </button>
            </div>
            {submission.code ? (
              <CodeEditor
                value={submission.code}
                onChange={() => {}}
                language={toCodeLanguage(submission.language)}
                readOnly
                height="min(28rem, 60vh)"
                className="hover:border-border focus-within:border-border focus-within:ring-0"
              />
            ) : (
              <div className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
                无代码内容（可能无权查看或已脱敏）
              </div>
            )}
          </section>

          {(showTests || submissionHistory.length > 0 || historyLoading) && (
            <aside className="space-y-4 min-w-0">
              {showTests && (
                <section className="card-static p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Target className="w-4 h-4 text-primary" />
                      测试点
                    </h2>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {submission.passedTests}/{submission.totalTests}
                    </span>
                  </div>
                  {waDownloadError && (
                    <p className="mb-2 text-xs text-error">{waDownloadError}</p>
                  )}
                  <div className="space-y-1.5 max-h-72 overflow-y-auto custom-scrollbar">
                    {submission.testResults && submission.testResults.length > 0 ? (
                      submission.testResults.map((result, index) => (
                        <TestPointRow
                          key={result.testId || `test-${index}`}
                          result={result}
                          index={index}
                          canDownloadWa={canDownloadWa && index === firstWaIndex}
                          downloading={waDownloading}
                          onDownloadWa={() => void handleDownloadWa()}
                        />
                      ))
                    ) : (
                      <div className="py-8 text-center text-sm text-muted-foreground">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                        正在执行…
                      </div>
                    )}
                  </div>
                </section>
              )}

              <section className="card-static p-4">
                <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <History className="w-4 h-4 text-accent" />
                  本题近期提交
                </h2>
                {historyLoading ? (
                  <div className="py-6 flex justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : submissionHistory.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">暂无其他提交</p>
                ) : (
                  <div className="space-y-1 max-h-64 overflow-y-auto custom-scrollbar">
                    {submissionHistory.map((item) => {
                      const active = item.id === submission.id
                      return (
                        <Link
                          key={item.id}
                          href={`/submission/${item.id}`}
                          className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                            active
                              ? 'bg-primary/10 border border-primary/25'
                              : 'hover:bg-muted border border-transparent'
                          }`}
                        >
                          <span className="flex items-center gap-1.5 min-w-0">
                            {getTestStatusIcon(item.status, 'w-3.5 h-3.5')}
                            <span className="truncate font-medium text-foreground">
                              {getStatusText(item.status)}
                            </span>
                            <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                              {item.score}
                            </span>
                          </span>
                          <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                            {formatDateTime(item.submittedAt)}
                          </span>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </section>
            </aside>
          )}
        </div>
      </PageContainer>
    </div>
  )
}
