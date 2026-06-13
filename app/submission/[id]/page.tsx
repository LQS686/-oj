'use client'

import { use, useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, FileCode, Clock, Database, User, Calendar, Code, CheckCircle, XCircle, AlertTriangle, Copy, Check, ChevronDown, ChevronRight, History, Target } from 'lucide-react'
import { formatTime, formatMemory } from '@/lib/utils'
import { getStatusColor, getStatusText } from '@/lib/status'

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

export default function SubmissionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submissionHistory, setSubmissionHistory] = useState<SubmissionHistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [expandedTestResults, setExpandedTestResults] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetchSubmission()
  }, [id])

  useEffect(() => {
    if (submission) {
      fetchSubmissionHistory()
    }
  }, [submission])

  const fetchSubmission = async () => {
    try {
      const response = await fetch(`/api/submissions/${id}`)
      const data = await response.json()

      if (data.success) {
        setSubmission(data.data)
      } else {
        if (response.status === 404) {
          setError('提交记录不存在或已被删除。如果这是作业提交，请从作业页面查看详情。')
        } else {
          setError(data.error || '加载失败')
        }
      }
    } catch (err) {
      console.error('获取提交详情失败:', err)
      setError('网络错误，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  const fetchSubmissionHistory = async () => {
    if (!submission) return

    try {
      setHistoryLoading(true)
      const response = await fetch(`/api/problems/${submission.problem.id}/submissions`)
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

  const getTestStatusIcon = (status: string) => {
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
      default:
        return <AlertTriangle className="w-5 h-5 text-muted-foreground" />
    }
  }

  const toggleTestResult = (testId: string) => {
    const newExpanded = new Set(expandedTestResults)
    if (newExpanded.has(testId)) {
      newExpanded.delete(testId)
    } else {
      newExpanded.add(testId)
    }
    setExpandedTestResults(newExpanded)
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
          <div>
            <h1 className="text-3xl font-bold text-foreground section-title">提交详情</h1>
            <p className="text-muted-foreground mt-1">查看提交代码和评测结果</p>
          </div>
        </div>

        <div className="card-static p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <div className="text-sm text-muted-foreground mb-2">状态</div>
              {getStatusBadge(submission.status)}
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-2">分数</div>
              <div className="text-3xl font-bold text-foreground">{submission.score}</div>
              <div className="text-sm text-muted-foreground mt-1">
                ({submission.passedTests}/{submission.totalTests} 测试点)
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-2">用时</div>
              <div className="text-2xl font-mono text-foreground">{formatTime(submission.time)}</div>
              <div className="w-full bg-muted rounded-full h-2 mt-2">
                <div 
                  className="h-2 rounded-full bg-primary transition-all" 
                  style={{ width: `${Math.min((submission.time / 1000) * 10, 100)}%` }}
                ></div>
              </div>
            </div>
            <div>
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
                  {new Date(submission.submittedAt).toLocaleString('zh-CN')}
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
                        : 'hover:bg-muted/50 border border-transparent'
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
                        {new Date(item.submittedAt).toLocaleString('zh-CN', { 
                          month: '2-digit', 
                          day: '2-digit', 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
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

        {submission.testResults && submission.testResults.length > 0 && (
          <div className="card-static p-6 mb-6">
            <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              测试点详情
            </h2>
            <div className="space-y-3">
              {submission.testResults.map((result, index) => {
                const isSuccess = result.status === 'AC' || result.status === 'Accepted'
                return (
                  <div
                    key={result.testId}
                    className={`p-4 rounded-lg border transition-all ${
                      isSuccess
                        ? 'bg-secondary/5 border-secondary/20 hover:border-secondary/40'
                        : 'bg-error/5 border-error/20 hover:border-error/40'
                    }`}
                  >
                    <div 
                      className="flex items-center justify-between cursor-pointer"
                      onClick={() => toggleTestResult(result.testId)}
                    >
                      <div className="flex items-center gap-3">
                        {getTestStatusIcon(result.status)}
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
                          <div className="font-mono font-semibold text-foreground">{formatTime(result.time)}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-muted-foreground">内存</div>
                          <div className="font-mono font-semibold text-foreground">{formatMemory(result.memory)}</div>
                        </div>
                        <div className="text-muted-foreground">
                          {expandedTestResults.has(result.testId) ? (
                            <ChevronDown className="w-5 h-5" />
                          ) : (
                            <ChevronRight className="w-5 h-5" />
                          )}
                        </div>
                      </div>
                    </div>
                    {expandedTestResults.has(result.testId) && result.message && (
                      <div className="mt-3 text-sm text-foreground bg-muted/50 p-3 rounded border border-border">
                        <div className="font-medium text-foreground mb-1">错误信息:</div>
                        <pre className="whitespace-pre-wrap text-muted-foreground">{result.message}</pre>
                      </div>
                    )}
                  </div>
                )
              })}
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
          <div className="bg-background-secondary rounded-lg overflow-hidden border border-border">
            <div className="px-4 py-3 bg-muted/50 text-muted-foreground text-sm flex justify-between items-center border-b border-border">
              <span className="font-medium">{submission.language}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs">
                  {submission.code.split('\n').length} 行
                </span>
              </div>
            </div>
            <pre className="p-4 overflow-x-auto max-h-96 custom-scrollbar">
              <code className="text-foreground text-sm font-mono">
                {submission.code}
              </code>
            </pre>
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
