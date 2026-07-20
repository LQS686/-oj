'use client'

/**
 * app/admin/submissions/[id]/page.tsx
 * 管理后台 - 提交详情（查看代码 / 评测结果 / 测试点详情）
 *
 * 复用前端 /api/submissions/[id] 接口；权限由 AdminLayout 统一拦截，
 * 同时保留与 admin/submissions/page.tsx 一致的 403 兜底处理。
 */
import { use, useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, FileCode, Clock, Database, User, Calendar, Code,
  CheckCircle, CheckCircle2, XCircle, AlertTriangle, Copy, Check,
  ChevronDown, ChevronRight, Target, RefreshCw, Loader2, Info, Shield
} from 'lucide-react'
import { formatTime, formatMemory, formatDateTime } from '@/lib/utils'
import { getStatusText, getDifficultyColor } from '@/lib/status'
import { fetchWithCookie } from '@/lib/api/base'

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

// 终态：评测已结束的状态（不再轮询）
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

function getTestStatusIcon(status: string) {
  switch (status) {
    case 'AC':
    case 'Accepted':
      return <CheckCircle className="w-5 h-5 text-secondary" />
    case 'WA':
    case 'Wrong Answer':
      return <XCircle className="w-5 h-5 text-error" />
    case 'TLE':
    case 'Time Limit Exceeded':
      return <Clock className="w-5 h-5 text-accent" />
    case 'MLE':
    case 'Memory Limit Exceeded':
      return <Database className="w-5 h-5 text-info" />
    case 'RE':
    case 'Runtime Error':
      return <AlertTriangle className="w-5 h-5 text-warning" />
    case 'CE':
    case 'Compile Error':
      return <Code className="w-5 h-5 text-muted-foreground" />
    case 'PE':
    case 'Presentation Error':
      return <AlertTriangle className="w-5 h-5 text-amber-600" />
    case 'OLE':
    case 'Output Limit Exceeded':
      return <AlertTriangle className="w-5 h-5 text-amber-600" />
    case 'CSP':
      return <XCircle className="w-5 h-5 text-[var(--difficulty-hard)]" />
    case 'PC':
    case 'Partly Correct':
      return <CheckCircle2 className="w-5 h-5 text-[var(--difficulty-medium)]" />
    default:
      return <AlertTriangle className="w-5 h-5 text-muted-foreground" />
  }
}

function TestPointRow({ result, index }: { result: TestResult; index: number }) {
  const isPass = result.status === 'AC' || result.status === 'Accepted'
  const isJudgingTest = result.status === 'Judging' || result.status === 'Pending' || result.status === 'Running'
  const [expanded, setExpanded] = useState(!isPass)
  const hasMessage = !!result.message

  return (
    <div
      className={`p-4 rounded-lg border transition-all ${
        isPass
          ? 'bg-secondary/5 border-secondary/20 hover:border-secondary/40'
          : isJudgingTest
          ? 'bg-muted border-border'
          : 'bg-error/5 border-error/20 hover:border-error/40'
      }`}
    >
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => hasMessage && setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          {isJudgingTest
            ? <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
            : getTestStatusIcon(result.status)}
          <div>
            <div className="font-semibold text-foreground">
              测试点 #{index + 1}
            </div>
            <div className="text-sm text-muted-foreground">{getStatusText(result.status)}</div>
          </div>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <div className="text-center">
            <div className="text-muted-foreground">时间</div>
            <div className="font-mono font-semibold text-foreground">
              {isJudgingTest ? '-' : formatTime(result.time)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground">内存</div>
            <div className="font-mono font-semibold text-foreground">
              {isJudgingTest ? '-' : formatMemory(result.memory)}
            </div>
          </div>
          {hasMessage && (
            <div className="text-muted-foreground">
              {expanded ? (
                <ChevronDown className="w-5 h-5" />
              ) : (
                <ChevronRight className="w-5 h-5" />
              )}
            </div>
          )}
        </div>
      </div>
      {expanded && result.message && (
        <div className="mt-3 text-sm text-foreground bg-muted p-3 rounded border border-border">
          <div className="font-medium text-foreground mb-1">错误信息:</div>
          <pre className="whitespace-pre-wrap text-muted-foreground">{result.message}</pre>
        </div>
      )}
    </div>
  )
}

export default function AdminSubmissionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  // 防止轮询与手动刷新产生竞态
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
    } catch (err) {
      console.error('获取提交详情失败:', err)
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

  // 首次加载 + id 变化时拉取
  useEffect(() => {
    fetchSubmission()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // 轮询兜底：非终态时每 3s 拉取一次
  useEffect(() => {
    if (!submission) return
    if (isFinalStatus(submission.status)) return

    const intervalId = setInterval(() => fetchSubmission(true), 3000)
    return () => clearInterval(intervalId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, submission?.status])

  const getStatusBadge = (status: string) => {
    const text = getStatusText(status)
    const isSuccess = status === 'AC' || status === 'Accepted'
    const isWrong = status === 'WA' || status === 'Wrong Answer'
    const isJudging = status === 'Judging' || status === 'Pending' || status === 'Running'

    if (isJudging) {
      return (
        <span className="tag tag-info text-base px-4 py-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          {text}
        </span>
      )
    }
    if (isSuccess) {
      return (
        <span className="tag tag-success text-base px-4 py-2">
          <CheckCircle className="w-4 h-4" />
          {text}
        </span>
      )
    }
    if (isWrong) {
      return (
        <span className="tag tag-error text-base px-4 py-2">
          <XCircle className="w-4 h-4" />
          {text}
        </span>
      )
    }
    return (
      <span className="tag tag-warning text-base px-4 py-2">
        <AlertTriangle className="w-4 h-4" />
        {text}
      </span>
    )
  }

  const handleCopyCode = async () => {
    if (!submission) return
    await navigator.clipboard.writeText(submission.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    )
  }

  if (error || !submission) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-8 h-8 text-error" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">加载失败</h2>
          <p className="text-muted-foreground mb-6 max-w-md">{error}</p>
          <Link href="/admin/submissions" className="btn btn-primary">
            返回提交列表
          </Link>
        </div>
      </div>
    )
  }

  const isAc = submission.status === 'AC' || submission.status === 'Accepted'
  const statusCardBorder = isAc ? 'border-secondary/40 bg-secondary/5' : 'border-border'
  const passRate = submission.totalTests > 0
    ? (submission.passedTests / submission.totalTests) * 100
    : 0

  return (
    <div className="space-y-6">
      {/* 顶部导航 */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link
          href="/admin/submissions"
          className="p-1.5 -ml-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          aria-label="返回提交列表"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)' }}
        >
          <Shield className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-foreground">提交详情</h1>
          <p className="text-sm text-muted-foreground">
            查看提交代码和评测结果
            {!isFinalStatus(submission.status) && (
              <span className="ml-2 inline-flex items-center gap-1 text-primary">
                <Loader2 className="w-3 h-3 animate-spin" />
                实时同步中
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => fetchSubmission(true)}
          disabled={isRefreshing}
          className="btn btn-outline text-sm py-2 px-3 flex items-center gap-2"
          title="手动刷新"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {/* 评测结果卡片 */}
      <div className="card p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className={`rounded-xl border p-4 ${statusCardBorder}`}>
            <div className="text-sm text-muted-foreground mb-2">状态</div>
            <div className="flex items-center gap-2 flex-wrap">
              {getStatusBadge(submission.status)}
            </div>
            <div className="text-sm text-muted-foreground mt-2">{getStatusText(submission.status)}</div>
          </div>
          <div className={`rounded-xl border p-4 ${statusCardBorder}`}>
            <div className="text-sm text-muted-foreground mb-2">分数</div>
            <div className="text-3xl font-bold text-foreground">{submission.score}</div>
            <div className="text-sm text-muted-foreground mt-1">
              ({submission.passedTests}/{submission.totalTests} 测试点)
            </div>
          </div>
          <div className={`rounded-xl border p-4 ${statusCardBorder}`}>
            <div className="text-sm text-muted-foreground mb-2 flex items-center gap-1">
              用时
              <span
                className="inline-flex items-center text-muted-foreground/70 cursor-help"
                title="总用时 = 所有测试点中最长的单点用时（NOI/ICPC 标准）"
              >
                <Info className="w-3.5 h-3.5" />
              </span>
            </div>
            <div className="text-2xl font-mono text-foreground">{formatTime(submission.time)}</div>
            <div className="w-full bg-muted rounded-full h-2 mt-2">
              <div
                className="h-2 rounded-full bg-primary transition-all"
                style={{ width: `${Math.min((submission.time / 1000) * 10, 100)}%` }}
              ></div>
            </div>
          </div>
          <div className={`rounded-xl border p-4 ${statusCardBorder}`}>
            <div className="text-sm text-muted-foreground mb-2">内存</div>
            <div className="text-2xl font-mono text-foreground">{formatMemory(submission.memory)}</div>
            <div className="w-full bg-muted rounded-full h-2 mt-2">
              <div
                className="h-2 rounded-full bg-secondary transition-all"
                style={{ width: `${Math.min((submission.memory / 10240) * 100, 100)}%` }}
              ></div>
            </div>
          </div>
        </div>

        {submission.message && (
          <div className="mt-6 p-4 rounded-lg bg-accent/10 border border-accent/20">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-accent">评测信息</div>
                <div className="text-sm text-accent/80 mt-1 whitespace-pre-wrap">{submission.message}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 基本信息 + 测试点统计 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            基本信息
          </h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">提交ID:</span>
              <code className="text-sm bg-muted px-2 py-1 rounded text-foreground">
                {submission.id.substring(0, 8)}...
              </code>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">题目:</span>
              <Link
                href={`/problem/${submission.problem.problemNumber || submission.problem.id}`}
                className="text-primary-light hover:text-primary transition-colors"
              >
                {submission.problem.title}
              </Link>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">难度:</span>
              <span className={`tag ${getDifficultyColor(submission.problem.difficulty)}`}>
                {submission.problem.difficulty}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">用户:</span>
              <Link
                href={`/user/${submission.user.id}`}
                className="text-foreground hover:text-primary-light transition-colors flex items-center gap-1"
              >
                <User className="w-4 h-4" />
                {submission.user.nickname || submission.user.username}
              </Link>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">语言:</span>
              <span className="tag">{submission.language}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">提交时间:</span>
              <span className="text-foreground flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {formatDateTime(submission.submittedAt)}
              </span>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
            <Target className="w-5 h-5 text-secondary" />
            测试点统计
          </h2>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm text-muted-foreground mb-2">
                <span>通过率</span>
                <span>{submission.passedTests} / {submission.totalTests}</span>
              </div>
              <div className="w-full bg-muted rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all ${
                    submission.totalTests > 0 && submission.passedTests === submission.totalTests
                      ? 'bg-secondary'
                      : submission.passedTests > 0
                      ? 'bg-accent'
                      : 'bg-error'
                  }`}
                  style={{ width: `${passRate}%` }}
                ></div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-border">
              <div className="text-center">
                <div className="text-2xl font-bold text-secondary">{submission.passedTests}</div>
                <div className="text-xs text-muted-foreground">通过</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-error">
                  {submission.totalTests - submission.passedTests}
                </div>
                <div className="text-xs text-muted-foreground">未通过</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">{submission.totalTests}</div>
                <div className="text-xs text-muted-foreground">总计</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 测试点详情 */}
      {(!isFinalStatus(submission.status) || (submission.testResults && submission.testResults.length > 0)) && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              测试点详情
              {!isFinalStatus(submission.status) && (
                <span className="ml-2 text-xs text-muted-foreground inline-flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  评测中
                </span>
              )}
            </h2>
            {!isFinalStatus(submission.status) && (
              <div className="text-sm text-muted-foreground">
                已完成 {submission.passedTests} / {submission.totalTests}
              </div>
            )}
          </div>
          <div className="space-y-3">
            {submission.testResults && submission.testResults.length > 0 ? (
              submission.testResults.map((result, index) => (
                <TestPointRow
                  key={result.testId || `test-${index}`}
                  result={result}
                  index={index}
                />
              ))
            ) : (
              !isFinalStatus(submission.status) && (
                <div className="text-center py-8 text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                  正在执行测试用例...
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* 提交代码 */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Code className="w-5 h-5 text-primary" />
            提交代码
          </h2>
          <button
            onClick={handleCopyCode}
            className="btn btn-outline text-sm py-2"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                已复制
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                复制代码
              </>
            )}
          </button>
        </div>
        <div className="rounded-xl overflow-hidden border border-border">
          <div className="px-4 py-2 bg-muted text-muted-foreground text-sm border-b border-border flex items-center justify-between">
            <span className="font-medium">{submission.language}</span>
            <span className="text-xs">{submission.code.split('\n').length} 行</span>
          </div>
          <div className="overflow-x-auto custom-scrollbar max-h-96 overflow-y-auto">
            <pre className="flex text-sm font-mono">
              <div className="bg-muted/50 text-muted-foreground text-right py-4 px-3 select-none border-r border-border sticky left-0">
                {submission.code.split('\n').map((_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
              </div>
              <code className="text-foreground py-4 px-4 block whitespace-pre">
                {submission.code}
              </code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
}
