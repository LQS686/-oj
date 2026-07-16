'use client'

import { use, useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, FileCode, Clock, Database, User, Calendar, Code, CheckCircle, CheckCircle2, XCircle, AlertTriangle, Copy, Check, ChevronDown, ChevronRight, History, Target, RefreshCw, Loader2, Info } from 'lucide-react'
import { formatTime, formatMemory, formatDateTime } from '@/lib/utils'
import { getStatusText } from '@/lib/status'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useSubmissionSocket } from '@/hooks/useSubmissionSocket'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
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

interface SubmissionHistoryItem {
 id: string
 status: string
 score: number
 time: number
 memory: number
 submittedAt: string
 language: string
}

// 终态：评测已结束的状态（不再轮询/订阅）
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
 // 实时刷新状态：用于展示"刷新中"小图标
 const [isRefreshing, setIsRefreshing] = useState(false)
 // 防止与 socket 推送/轮询产生竞态
 const isRefreshingRef = useRef(false)

 const submissionTabTitle = submission?.problem?.title
   ? `${submission.problem.title} - 提交`
   : submission
     ? '提交详情'
     : undefined
 useDocumentTitle(submissionTabTitle)

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
 // 404 分支：仅在首次加载（submission 仍为 null）时显示"不存在"
 if (response.status === 404) {
 setSubmission((prev) => {
 if (!prev) setError('提交记录不存在或已被删除。如果这是作业提交，请从作业页面查看详情。')
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
 }, [id])

 // 首次加载 + id 变化时拉取
 useEffect(() => {
 fetchSubmission()
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [id])

 // WebSocket 实时推送
 useSubmissionSocket({
 userId: user?.id || '',
 enabled: !!user,
 onSubmissionUpdate: (data) => {
 if (data.id !== id) return
 // 局部更新：避免重新加载整条记录（保留代码等大字段）
 setSubmission((prev) => {
 if (!prev) return prev
 return {
 ...prev,
 status: data.status,
 score: data.score ?? prev.score,
 time: data.time ?? prev.time,
 memory: data.memory ?? prev.memory,
 passedTests: data.passedTests ?? prev.passedTests,
 totalTests: data.totalTests ?? prev.totalTests,
 message: data.message ?? prev.message,
 testResults: Array.isArray(data.testResults) && data.testResults.length > 0
 ? data.testResults
 : prev.testResults,
 }
 })
 },
 onJudgeProgress: (data) => {
 if (data.submissionId !== id) return
 setSubmission((prev) => {
 if (!prev) return prev
 return {
 ...prev,
 status: data.status === 'Judging' || data.status === 'Pending' ? data.status : prev.status,
 totalTests: data.totalTests || prev.totalTests,
 }
 })
 },
 })

 // 轮询兜底：非终态时每 3s 拉取一次（WebSocket 不可用时仍能更新）
 // deps 仅依赖 status 字符串，避免 WS 乐观更新 setSubmission 触发 interval 反复重建。
 useEffect(() => {
 if (!submission) return
 if (isFinalStatus(submission.status)) return

 let intervalId: ReturnType<typeof setInterval> | null = null
 const start = () => {
 if (intervalId) return
 intervalId = setInterval(() => fetchSubmission(true), 3000)
 }
 const stop = () => {
 if (intervalId) {
 clearInterval(intervalId)
 intervalId = null
 }
 }
 const onVisibilityChange = () => {
 if (document.visibilityState === 'visible') {
 fetchSubmission(true)
 start()
 } else {
 stop()
 }
 }

 if (document.visibilityState === 'visible') start()
 document.addEventListener('visibilitychange', onVisibilityChange)
 return () => {
 stop()
 document.removeEventListener('visibilitychange', onVisibilityChange)
 }
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [id, submission?.status])

 useEffect(() => {
 if (submission) {
 fetchSubmissionHistory()
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
 setSubmissionHistory(Array.isArray(data.data.submissions) ? data.data.submissions.slice(0, 10) : [])
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
 <div className="relative w-16 h-16 mx-auto mb-6">
 <div className="absolute inset-0 rounded-full border-2 border-primary/20"></div>
 <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin"></div>
 </div>
 <p className="text-muted-foreground">加载中...</p>
 </div>
 </div>
 )
 }

 if (error || !submission) {
 return (
 <div className="min-h-screen bg-background flex items-center justify-center">
 <div className="text-center">
 <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-error/10 flex items-center justify-center">
 <XCircle className="w-10 h-10 text-error" />
 </div>
 <h2 className="text-2xl font-bold text-foreground mb-2">加载失败</h2>
 <p className="text-muted-foreground mb-6 max-w-md">{error}</p>
 <button
 onClick={() => router.back()}
 className="btn btn-primary"
 >
 返回
 </button>
 </div>
 </div>
 )
 }

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
 await navigator.clipboard.writeText(submission.code)
 setCopied(true)
 setTimeout(() => setCopied(false), 2000)
 }

 const getStatusIcon = (status: string) => {
 switch (status) {
 case 'AC':
 return <CheckCircle className="w-4 h-4 text-secondary" />
 case 'WA':
 return <XCircle className="w-4 h-4 text-error" />
 case 'TLE':
 return <Clock className="w-4 h-4 text-accent" />
 case 'MLE':
 return <Database className="w-4 h-4 text-info" />
 case 'RE':
 return <AlertTriangle className="w-4 h-4 text-warning" />
 case 'CE':
 return <Code className="w-4 h-4 text-muted-foreground" />
 case 'PE':
 case 'Presentation Error':
 return <AlertTriangle className="w-4 h-4 text-amber-600" />
 case 'OLE':
 case 'Output Limit Exceeded':
 return <AlertTriangle className="w-4 h-4 text-amber-600" />
 case 'CSP':
 return <XCircle className="w-4 h-4 text-[var(--difficulty-hard)]" />
 case 'PC':
 case 'Partly Correct':
 return <CheckCircle2 className="w-4 h-4 text-[var(--difficulty-medium)]" />
 default:
 return <Clock className="w-4 h-4 text-muted-foreground" />
 }
 }

 const getDifficultyColor = (difficulty: string) => {
 switch (difficulty.toLowerCase()) {
 case 'easy':
 case '简单':
 return 'tag-success'
 case 'medium':
 case '中等':
 return 'tag-warning'
 case 'hard':
 case '困难':
 return 'tag-error'
 default:
 return 'tag-primary'
 }
 }

 const isAc = submission.status === 'AC' || submission.status === 'Accepted'
 const statusCardBorder = isAc ? 'border-secondary/40 bg-secondary/5' : 'border-border'

 return (
 <div className="min-h-screen bg-background">
 <div className="container mx-auto px-4 py-8 max-w-7xl">
 <button
 onClick={() => router.back()}
 className="nav-link mb-6"
 >
 <ArrowLeft className="w-4 h-4" />
 返回提交列表
 </button>

 <div className="flex items-center gap-4 mb-8">
 <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
 <FileCode className="w-6 h-6 text-primary" />
 </div>
 <div className="flex-1">
 <h1 className="text-3xl font-bold text-foreground section-title">提交详情</h1>
 <p className="text-muted-foreground mt-1">
 查看提交代码和评测结果
 {!isFinalStatus(submission?.status) && (
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

 <div className="card-static p-6 mb-6">
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
 <div className={`rounded-xl border p-4 ${statusCardBorder}`}>
 <div className="text-sm text-muted-foreground mb-2">状态</div>
 <div className="flex items-center gap-2 flex-wrap">
 {getStatusBadge(submission.status)}
  <span className="text-sm text-muted-foreground">{getStatusText(submission.status)}</span>
 </div>
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
 title="总用时 = 所有测试点中最长的单点用时（NOI/ICPC 标准），用于公平比较不同程序在最坏输入下的表现"
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

 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
 <div className="card-static p-6">
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
 <span className="tag">
 {submission.language}
 </span>
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

 <div className="card-static p-6">
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
 submission.passedTests === submission.totalTests
 ? 'bg-secondary'
 : submission.passedTests > 0
 ? 'bg-accent'
 : 'bg-error'
 }`}
 style={{ width: `${(submission.passedTests / submission.totalTests) * 100}%` }}
 ></div>
 </div>
 </div>
 <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border">
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

 <div className="card-static p-6">
 <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
 <History className="w-5 h-5 text-accent" />
 提交历史
 </h2>
 {historyLoading ? (
 <div className="flex items-center justify-center py-8">
 <div className="relative w-8 h-8">
 <div className="absolute inset-0 rounded-full border-2 border-primary/20"></div>
 <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin"></div>
 </div>
 </div>
 ) : submissionHistory.length === 0 ? (
 <div className="text-center py-8">
 <History className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
 <p className="text-muted-foreground text-sm">暂无提交历史</p>
 </div>
 ) : (
 <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-2">
 {submissionHistory.map((item) => (
 <Link 
 key={item.id} 
 href={`/submission/${item.id}`}
 className={`block p-3 rounded-lg transition-all ${
 item.id === submission.id 
 ? 'bg-primary/10 border border-primary/30'
 : 'hover:bg-muted border border-transparent'
 }`}
 >
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 {getStatusIcon(item.status)}
 <span className="font-medium text-foreground text-sm">
 {getStatusText(item.status)}
 </span>
 </div>
 <span className="text-xs text-muted-foreground">
 {formatDateTime(item.submittedAt)}
 </span>
 </div>
 <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
 <span>分数: {item.score}</span>
 <span>用时: {formatTime(item.time)}</span>
 <span>内存: {formatMemory(item.memory)}</span>
 </div>
 </Link>
 ))}
 </div>
 )}
 </div>
 </div>

 {(!isFinalStatus(submission.status) || (submission.testResults && submission.testResults.length > 0)) && (
 <div className="card-static p-6 mb-6">
 <div className="flex items-center justify-between mb-4">
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

 <div className="card-static p-6">
 <div className="flex items-center justify-between mb-4">
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

 <div className="mt-8 text-center">
 <Link
 href={`/problem/${submission.problem.problemNumber || submission.problem.id}`}
 className="btn btn-primary"
 >
 返回题目页面
 </Link>
 </div>
 </div>
 </div>
 )
}
