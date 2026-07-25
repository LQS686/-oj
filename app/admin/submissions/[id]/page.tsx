'use client'

/**
 * app/admin/submissions/[id]/page.tsx
 * 管理后台 - 提交详情（代码 / 评测结果 / 测试点 / 重测）
 */
import { use, useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
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
  Target,
  RefreshCw,
  Loader2,
  Info,
  RotateCcw,
  ExternalLink,
  FileText,
} from 'lucide-react'
import { formatTime, formatMemory, formatDateTime } from '@/lib/utils'
import { getStatusText, getDifficultyColor } from '@/lib/status'
import { fetchWithCookie } from '@/lib/api/base'
import { AdminPageShell } from '@/components/admin'
import { PageLoading, useDialog } from '@/components/common'
import CodeEditor, { type CodeLanguage } from '@/components/code-editor/CodeEditor'

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

const FINAL_STATUSES = new Set([
  'AC', 'Accepted',
  'WA', 'Wrong Answer',
  'TLE', 'Time Limit Exceeded',
  'MLE', 'Memory Limit Exceeded',
  'RE', 'Runtime Error',
  'CE', 'Compile Error',
  'SE', 'System Error',
  'PE', 'Presentation Error',
  'OLE', 'Output Limit Exceeded',
  'CSP',
  'PC', 'Partly Correct',
])

function isFinalStatus(status: string | undefined | null): boolean {
  if (!status) return false
  return FINAL_STATUSES.has(status)
}

function isJudgingStatus(status: string): boolean {
  return ['PENDING', 'JUDGING', 'RUNNING', 'Pending', 'Judging', 'Running'].includes(status)
}

function isPassStatus(status: string): boolean {
  return status === 'AC' || status === 'Accepted'
}

function toCodeLanguage(lang: string): CodeLanguage {
  if (lang === 'c' || lang === 'python') return lang
  return 'cpp'
}

function getTestStatusIcon(status: string) {
  switch (status) {
    case 'AC':
    case 'Accepted':
      return <CheckCircle className="w-4 h-4 text-secondary" />
    case 'WA':
    case 'Wrong Answer':
      return <XCircle className="w-4 h-4 text-error" />
    case 'TLE':
    case 'Time Limit Exceeded':
      return <Clock className="w-4 h-4 text-accent" />
    case 'MLE':
    case 'Memory Limit Exceeded':
      return <Database className="w-4 h-4 text-info" />
    case 'RE':
    case 'Runtime Error':
      return <AlertTriangle className="w-4 h-4 text-warning" />
    case 'CE':
    case 'Compile Error':
      return <Code className="w-4 h-4 text-muted-foreground" />
    case 'PC':
    case 'Partly Correct':
      return <CheckCircle2 className="w-4 h-4 text-[var(--difficulty-medium)]" />
    default:
      return <AlertTriangle className="w-4 h-4 text-muted-foreground" />
  }
}

function StatusBadge({ status }: { status: string }) {
  const text = getStatusText(status)
  if (isJudgingStatus(status)) {
    return (
      <span className="tag tag-info">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        {text}
      </span>
    )
  }
  if (isPassStatus(status)) {
    return (
      <span className="tag tag-success">
        <CheckCircle className="w-3.5 h-3.5" />
        {text}
      </span>
    )
  }
  if (status === 'WA' || status === 'Wrong Answer') {
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

function TestPointRow({ result, index }: { result: TestResult; index: number }) {
  const isPass = isPassStatus(result.status)
  const judging = isJudgingStatus(result.status)
  const hasMessage = !!result.message
  const [expanded, setExpanded] = useState(!isPass && hasMessage)

  return (
    <div
      className={`rounded-lg border transition-colors ${
        isPass
          ? 'border-secondary/25 bg-secondary/5'
          : judging
            ? 'border-border bg-muted/40'
            : 'border-error/25 bg-error/5'
      }`}
    >
      <button
        type="button"
        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left"
        onClick={() => hasMessage && setExpanded((v) => !v)}
        disabled={!hasMessage}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {judging ? (
            <Loader2 className="w-4 h-4 text-muted-foreground animate-spin shrink-0" />
          ) : (
            getTestStatusIcon(result.status)
          )}
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground">测试点 #{index + 1}</div>
            <div className="text-xs text-muted-foreground truncate">{getStatusText(result.status)}</div>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs shrink-0">
          <span className="font-mono tabular-nums text-foreground">
            {judging ? '—' : formatTime(result.time)}
          </span>
          <span className="font-mono tabular-nums text-muted-foreground">
            {judging ? '—' : formatMemory(result.memory)}
          </span>
          {hasMessage && (
            expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>
      {expanded && result.message && (
        <div className="px-3 pb-3">
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap bg-muted/80 border border-border rounded-md p-2.5 max-h-48 overflow-auto custom-scrollbar">
            {result.message}
          </pre>
        </div>
      )}
    </div>
  )
}

function MetricCell({
  label,
  value,
  hint,
  accent,
}: {
  label: string
  value: ReactNode
  hint?: string
  accent?: boolean
}) {
  return (
    <div className={`rounded-lg border p-3 ${accent ? 'border-secondary/35 bg-secondary/5' : 'border-border bg-card'}`}>
      <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
        {label}
        {hint && (
          <span title={hint} className="inline-flex text-muted-foreground/70 cursor-help">
            <Info className="w-3 h-3" />
          </span>
        )}
      </div>
      <div className="text-xl font-bold font-mono tabular-nums text-foreground leading-tight">{value}</div>
    </div>
  )
}

export default function AdminSubmissionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const dialog = useDialog()
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copiedCode, setCopiedCode] = useState(false)
  const [copiedId, setCopiedId] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [rejudging, setRejudging] = useState(false)
  const isRefreshingRef = useRef(false)

  const fetchSubmission = useCallback(async (showRefreshing = false) => {
    if (isRefreshingRef.current) return
    isRefreshingRef.current = true
    if (showRefreshing) setIsRefreshing(true)
    try {
      const response = await fetchWithCookie(`/api/submissions/${id}`)
      const data = await response.json()

      if (data.success) {
        setSubmission(data.data)
        setError('')
      } else {
        if (response.status === 403) {
          setError('需要管理员权限')
          setTimeout(() => router.push('/403'), 2000)
          return
        }
        if (response.status === 404) {
          setSubmission((prev) => {
            if (!prev) setError('提交记录不存在或已被删除。')
            return prev
          })
        } else {
          setError(data.error || '加载失败')
        }
      }
    } catch {
      setSubmission((prev) => {
        if (!prev) setError('网络错误，请稍后重试')
        return prev
      })
    } finally {
      setLoading(false)
      isRefreshingRef.current = false
      if (showRefreshing) setIsRefreshing(false)
    }
  }, [id, router])

  useEffect(() => {
    void fetchSubmission()
  }, [fetchSubmission])

  useEffect(() => {
    if (!submission) return
    if (isFinalStatus(submission.status)) return
    const intervalId = setInterval(() => void fetchSubmission(true), 3000)
    return () => clearInterval(intervalId)
  }, [id, submission?.status, fetchSubmission])

  const handleCopyCode = async () => {
    if (!submission?.code) return
    await navigator.clipboard.writeText(submission.code)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
  }

  const handleCopyId = async () => {
    if (!submission) return
    await navigator.clipboard.writeText(submission.id)
    setCopiedId(true)
    setTimeout(() => setCopiedId(false), 2000)
  }

  const handleRejudge = async () => {
    if (!submission || rejudging) return
    const ok = await dialog.confirm({
      title: '重新评测',
      message: '将使用当前代码与题目测试点重新入队评测，原结果会被覆盖。确定继续？',
      tone: 'warning',
      confirmText: '开始重测',
      confirmVariant: 'destructive',
    })
    if (!ok) return

    setRejudging(true)
    try {
      const response = await fetchWithCookie(`/api/admin/submissions/${id}/rejudge`, {
        method: 'POST',
      })
      const data = await response.json()
      if (!data.success) {
        await dialog.alert({
          title: '重测失败',
          message: data.error || '无法重新评测',
          tone: 'error',
        })
        return
      }
      setSubmission((prev) =>
        prev
          ? {
              ...prev,
              status: 'PENDING',
              score: 0,
              time: 0,
              memory: 0,
              passedTests: 0,
              totalTests: data.data?.totalTests ?? prev.totalTests,
              message: undefined,
              testResults: [],
            }
          : prev
      )
      void fetchSubmission(true)
    } catch {
      await dialog.alert({
        title: '重测失败',
        message: '网络错误，请稍后重试',
        tone: 'error',
      })
    } finally {
      setRejudging(false)
    }
  }

  if (loading) {
    return <PageLoading label="加载提交详情..." />
  }

  if (error || !submission) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="w-14 h-14 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-7 h-7 text-error" />
          </div>
          <h2 className="text-lg font-bold text-foreground mb-2">加载失败</h2>
          <p className="text-muted-foreground mb-6 max-w-md text-sm">{error}</p>
          <Link href="/admin/submissions" className="btn btn-primary">
            返回提交列表
          </Link>
        </div>
      </div>
    )
  }

  const isAc = isPassStatus(submission.status)
  const isCe = submission.status === 'CE' || submission.status === 'Compile Error'
  const judging = isJudgingStatus(submission.status)
  const passRate =
    submission.totalTests > 0 ? (submission.passedTests / submission.totalTests) * 100 : 0
  const failedCount = Math.max(0, submission.totalTests - submission.passedTests)
  const codeLines = submission.code ? submission.code.split('\n').length : 0
  const problemHref = `/problem/${submission.problem.problemNumber || submission.problem.id}`

  return (
    <AdminPageShell width="wide" className="space-y-5">
      {/* 顶栏 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <Link
            href="/admin/submissions"
            className="p-1.5 -ml-1.5 mt-0.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
            aria-label="返回提交列表"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-foreground truncate">
                {submission.problem.problemNumber && (
                  <span className="font-mono text-muted-foreground mr-1.5 text-base">
                    {submission.problem.problemNumber}
                  </span>
                )}
                {submission.problem.title}
              </h1>
              <StatusBadge status={submission.status} />
              {judging && (
                <span className="text-xs text-primary inline-flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  实时同步中
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1">
                <User className="w-3.5 h-3.5" />
                {submission.user.nickname || submission.user.username}
              </span>
              <span className="inline-flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {formatDateTime(submission.submittedAt)}
              </span>
              <span className="tag">{submission.language}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap sm:justify-end">
          <button
            type="button"
            onClick={() => void fetchSubmission(true)}
            disabled={isRefreshing}
            className="btn btn-outline text-sm py-1.5 px-3 gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            刷新
          </button>
          <button
            type="button"
            onClick={() => void handleRejudge()}
            disabled={rejudging || judging}
            className="btn btn-outline text-sm py-1.5 px-3 gap-1.5 disabled:opacity-50"
            title={judging ? '评测进行中' : '重新评测'}
          >
            {rejudging ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RotateCcw className="w-4 h-4" />
            )}
            重测
          </button>
          <Link
            href={`/submission/${submission.id}`}
            className="btn btn-outline text-sm py-1.5 px-3 gap-1.5"
            target="_blank"
          >
            <ExternalLink className="w-4 h-4" />
            前台页
          </Link>
        </div>
      </div>

      {/* 指标 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCell
          label="分数"
          value={
            <>
              {submission.score}
              <span className="text-xs font-normal text-muted-foreground ml-1.5">
                ({submission.passedTests}/{submission.totalTests})
              </span>
            </>
          }
          accent={isAc}
        />
        <MetricCell
          label="用时"
          value={formatTime(submission.time ?? 0)}
          hint="总用时 = 所有测试点中最长的单点用时"
          accent={isAc}
        />
        <MetricCell label="内存" value={formatMemory(submission.memory ?? 0)} accent={isAc} />
        <MetricCell
          label="通过率"
          value={`${submission.totalTests > 0 ? Math.round(passRate) : 0}%`}
          accent={isAc}
        />
      </div>

      {(submission.message || isCe) && (
        <div
          className={`rounded-lg border p-3.5 flex gap-3 ${
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
            <pre className="text-sm text-muted-foreground whitespace-pre-wrap break-words max-h-56 overflow-auto custom-scrollbar">
              {submission.message || '（无详细信息）'}
            </pre>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
        {/* 左：元信息 + 测试点 */}
        <div className="xl:col-span-2 space-y-5">
          <section className="card p-4">
            <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              基本信息
            </h2>
            <dl className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground shrink-0">提交 ID</dt>
                <dd className="flex items-center gap-1.5 min-w-0">
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded truncate" title={submission.id}>
                    {submission.id}
                  </code>
                  <button
                    type="button"
                    onClick={() => void handleCopyId()}
                    className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                    title="复制完整 ID"
                    aria-label="复制提交 ID"
                  >
                    {copiedId ? <Check className="w-3.5 h-3.5 text-secondary" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">题目</dt>
                <dd className="text-right">
                  <Link href={problemHref} className="text-primary-light hover:text-primary">
                    {submission.problem.title}
                  </Link>
                  {submission.problem.id && (
                    <Link
                      href={`/admin/problems/${submission.problem.id}/edit`}
                      className="ml-2 text-xs text-muted-foreground hover:text-foreground"
                    >
                      编辑
                    </Link>
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">难度</dt>
                <dd>
                  <span className={`tag ${getDifficultyColor(submission.problem.difficulty)}`}>
                    {submission.problem.difficulty}
                  </span>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">用户</dt>
                <dd>
                  <Link
                    href={`/user/${submission.user.id}`}
                    className="inline-flex items-center gap-1 hover:text-primary-light"
                  >
                    <User className="w-3.5 h-3.5 text-muted-foreground" />
                    {submission.user.nickname || submission.user.username}
                  </Link>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">语言</dt>
                <dd><span className="tag">{submission.language}</span></dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">提交时间</dt>
                <dd className="font-mono text-xs tabular-nums">{formatDateTime(submission.submittedAt)}</dd>
              </div>
            </dl>
          </section>

          <section className="card p-4">
            <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Target className="w-4 h-4 text-secondary" />
              测试点统计
            </h2>
            <div className="mb-3">
              <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                <span>通过率</span>
                <span className="tabular-nums">
                  {submission.passedTests} / {submission.totalTests}
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    submission.totalTests > 0 && submission.passedTests === submission.totalTests
                      ? 'bg-secondary'
                      : submission.passedTests > 0
                        ? 'bg-accent'
                        : 'bg-error'
                  }`}
                  style={{ width: `${passRate}%` }}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border">
              <div className="text-center">
                <div className="text-lg font-bold text-secondary tabular-nums">{submission.passedTests}</div>
                <div className="text-[11px] text-muted-foreground">通过</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-error tabular-nums">{failedCount}</div>
                <div className="text-[11px] text-muted-foreground">未通过</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-primary tabular-nums">{submission.totalTests}</div>
                <div className="text-[11px] text-muted-foreground">总计</div>
              </div>
            </div>
          </section>

          {(judging || (submission.testResults && submission.testResults.length > 0)) && (
            <section className="card p-4">
              <div className="flex items-center justify-between mb-3 gap-2">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Target className="w-4 h-4 text-primary" />
                  测试点详情
                </h2>
                {judging && (
                  <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    评测中
                  </span>
                )}
              </div>
              <div className="space-y-2 max-h-[28rem] overflow-y-auto custom-scrollbar pr-0.5">
                {submission.testResults && submission.testResults.length > 0 ? (
                  submission.testResults.map((result, index) => (
                    <TestPointRow
                      key={result.testId || `test-${index}`}
                      result={result}
                      index={index}
                    />
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                    正在执行测试用例…
                  </div>
                )}
              </div>
            </section>
          )}
        </div>

        {/* 右：代码（首屏可见） */}
        <section className="xl:col-span-3 card p-4 flex flex-col min-h-[28rem]">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
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
              {copiedCode ? (
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
              height="480px"
              className="hover:border-border focus-within:border-border focus-within:ring-0"
            />
          ) : (
            <div className="flex-1 min-h-[12rem] flex items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
              无代码内容（可能已脱敏或不存在）
            </div>
          )}
        </section>
      </div>
    </AdminPageShell>
  )
}
