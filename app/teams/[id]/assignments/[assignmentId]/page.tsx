'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useUser } from '@/contexts/UserContext'
import { fetchWithAuth } from '@/lib/api/base'
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  XCircle,
  Edit,
  Trash2,
  MoreHorizontal,
  FileText,
  Users,
  Send,
  AlertCircle,
  FileCode,
  X,
} from 'lucide-react'
import StudentCompletionTable from '@/components/StudentCompletionTable'
import ProblemDescription from '@/components/problem/ProblemDescription'
import { getDifficultyColor } from '@/lib/status'
import { logger } from '@/lib/logger'
import { useSubmissionSocket } from '@/hooks/useSubmissionSocket'

const languageOptions = [
  { value: 'cpp', label: 'C++', version: 'C++17' },
  { value: 'c', label: 'C', version: 'C11' },
  { value: 'java', label: 'Java', version: 'Java 17' },
  { value: 'python', label: 'Python', version: 'Python 3.10' },
  { value: 'javascript', label: 'JavaScript', version: 'Node.js 18' }
]

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

interface Problem {
  id: string
  title: string
  difficulty: string
  totalSubmit: number
  totalAccepted: number
}

interface Assignment {
  id: string
  title: string
  description: string
  startTime: string
  endTime: string
  status: string
  problems: Problem[]
}

interface Submission {
  id: string
  userId?: string
  problemId: string
  status: string
  score: number
  submittedAt: string
}

interface TeamMember {
  id: string
  userId: string
  role: string
  username?: string
  nickname?: string
  avatar?: string
}

export default function AssignmentDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useUser()
  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [allSubmissions, setAllSubmissions] = useState<Submission[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [userRole, setUserRole] = useState<string>('member')
  const [showActions, setShowActions] = useState(false)

  const [activeTab, setActiveTab] = useState<'problems' | 'ranking'>('problems')
  const [selectedProblemIndex, setSelectedProblemIndex] = useState(0)
  const [problemDetail, setProblemDetail] = useState<any>(null)
  const [problemLoading, setProblemLoading] = useState(false)

  const [code, setCode] = useState('')
  const [language, setLanguage] = useState('cpp')
  const [submitting, setSubmitting] = useState(false)
  const [currentSubmissionId, setCurrentSubmissionId] = useState<string | null>(null)
  const [judgeStatus, setJudgeStatus] = useState<any>(null)
  const [judgeProgress, setJudgeProgress] = useState<{ currentTest: number; totalTests: number } | null>(null)
  const [lastResult, setLastResult] = useState<{ status: string; score: number } | null>(null)
  const [submitCooldown, setSubmitCooldown] = useState(false)

  useEffect(() => {
    fetchAssignment()
    fetchTeamMembers()
  }, [params.id, params.assignmentId])

  useEffect(() => {
    if (!teamMembers.length || !user) return
    const member = teamMembers.find((m: TeamMember) => m.userId === user.id)
    if (member && member.role !== userRole) {
      setUserRole(member.role)
    }
  }, [user, teamMembers])

  const fetchAssignment = async () => {
    try {
      setLoading(true)
      const response = await fetchWithAuth(`/api/teams/${params.id}/assignments/${params.assignmentId}`)
      const data = await response.json()
      if (data.success) {
        setAssignment(data.data.assignment)
        setSubmissions(Array.isArray(data.data.submissions) ? data.data.submissions : [])
        setAllSubmissions(Array.isArray(data.data.allSubmissions) ? data.data.allSubmissions : [])
      } else {
        setError(data.error || '获取作业失败')
      }
    } catch (err) {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }

  const fetchTeamMembers = async () => {
    try {
      const response = await fetchWithAuth(`/api/teams/${params.id}/members`)
      const data = await response.json()
      if (data.success) {
        setTeamMembers(data.data)
      }
    } catch (err) {
      logger.error('获取团队成员失败', err)
    }
  }

  const fetchProblemDetail = useCallback(async (problemId: string) => {
    try {
      setProblemLoading(true)
      const response = await fetch(`/api/problems/${problemId}`)
      const data = await response.json()
      if (data.success) {
        setProblemDetail(data.data)
      } else {
        setProblemDetail(null)
      }
    } catch (err) {
      setProblemDetail(null)
    } finally {
      setProblemLoading(false)
    }
  }, [])

  useEffect(() => {
    if (assignment?.problems?.length && activeTab === 'problems') {
      const targetIndex = Math.min(selectedProblemIndex, assignment.problems.length - 1)
      fetchProblemDetail(assignment.problems[targetIndex].id)
    }
  }, [selectedProblemIndex, assignment?.problems, activeTab, fetchProblemDetail])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(`code_team_${params.id}_${params.assignmentId}_*`)
    }
  }, [params.id, params.assignmentId])

  const { isConnected } = useSubmissionSocket({
    userId: user?.id || '',
    enabled: !!user,
    onSubmissionUpdate: (data) => {
      if (data.id === currentSubmissionId) {
        setJudgeStatus({
          submissionId: data.id,
          status: data.status,
          passedTests: data.passedTests || 0,
          totalTests: data.totalTests || 0,
          testResults: data.testResults || [],
        })
        if (data.status !== 'Pending' && data.status !== 'Judging') {
          setSubmitting(false)
          setSubmitCooldown(false)
          setJudgeProgress(null)
          setLastResult({
            status: data.status,
            score: data.score || data.passedTests * 10
          })
          setCode('')
          setSubmissions(prev => {
            const newSub = {
              id: currentSubmissionId || '',
              userId: user?.id,
              problemId: assignment?.problems?.[selectedProblemIndex]?.id || '',
              status: data.status,
              score: data.score || data.passedTests * 10,
              submittedAt: new Date().toISOString()
            }
            const filtered = prev.filter(s =>
              !(s.userId === user?.id && s.problemId === (assignment?.problems?.[selectedProblemIndex]?.id || ''))
            )
            return [...filtered, newSub]
          })
        }
      }
    },
    onJudgeProgress: (data) => {
      if (data.submissionId === currentSubmissionId) {
        setJudgeProgress({
          currentTest: data.currentTest,
          totalTests: data.totalTests,
        })
        if (!judgeStatus) {
          setJudgeStatus({
            submissionId: data.submissionId,
            status: 'Judging',
            passedTests: 0,
            totalTests: data.totalTests,
            testResults: [],
          })
        }
      }
    }
  })

  const handleSubmit = async () => {
    if (!user) {
      router.push('/login')
      return
    }
    if (!code.trim() || code.trim().length < 10) return
    if (!assignment?.problems?.[selectedProblemIndex]) return
    if (submitting || submitCooldown) return

    setSubmitting(true)
    setSubmitCooldown(true)
    setJudgeStatus(null)
    setJudgeProgress(null)
    setLastResult(null)

    try {
      const submitUrl = `/api/teams/${params.id}/assignments/${params.assignmentId}/submit`
      const response = await fetchWithAuth(submitUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problemId: assignment.problems[selectedProblemIndex].id,
          code,
          language
        })
      })
      const data = await response.json()
      if (data.success) {
        setCurrentSubmissionId(data.submissionId)
      } else {
        setSubmitting(false)
        setTimeout(() => setSubmitCooldown(false), 3000)
      }
    } catch (error) {
      setSubmitting(false)
      setTimeout(() => setSubmitCooldown(false), 3000)
    }
  }

  const getProblemStatus = (problemId: string) => {
    const problemSubs = submissions.filter(s => s.problemId === problemId)
    if (problemSubs.length === 0) return null
    return problemSubs.reduce((best, current) =>
      (current.score || 0) > (best.score || 0) ? current : best
    )
  }

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'active': return { label: '进行中', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' }
      case 'upcoming': return { label: '未开始', color: 'text-blue-600 bg-blue-50 border-blue-200' }
      case 'ended': return { label: '已结束', color: 'text-slate-500 bg-slate-50 border-slate-200' }
      default: return { label: status, color: 'text-slate-500 bg-slate-50 border-slate-200' }
    }
  }

  const isAdminOrOwner = userRole === 'owner' || userRole === 'admin'

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <span className="text-sm text-muted-foreground">加载中...</span>
        </div>
      </div>
    )
  }

  if (error || !assignment) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-error mb-4">{error || '作业不存在'}</p>
          <button onClick={() => router.push(`/teams/${params.id}?tab=assignments`)} className="btn-primary btn">
            返回列表
          </button>
        </div>
      </div>
    )
  }

  const statusConfig = getStatusConfig(assignment.status)
  const selectedProblem = assignment.problems?.[selectedProblemIndex]
  const selectedProblemStatus = selectedProblem ? getProblemStatus(selectedProblem.id) : null

  const tabs = [
    { key: 'problems' as const, label: '题目', icon: FileText },
    ...(isAdminOrOwner ? [{ key: 'ranking' as const, label: '完成情况', icon: Users }] : [])
  ]

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <button
          onClick={() => router.push(`/teams/${params.id}?tab=assignments`)}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          返回作业列表
        </button>

        <div className="bg-white dark:bg-card rounded-xl border border-border overflow-hidden mb-4 shadow-sm">
          <div className="px-5 py-4 border-b border-border">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <h1 className="text-xl font-bold text-foreground truncate">{assignment.title}</h1>
                <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${statusConfig.color}`}>
                  {statusConfig.label}
                </span>
              </div>
              {isAdminOrOwner && (
                <div className="relative shrink-0">
                  <button
                    onClick={() => setShowActions(!showActions)}
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    onBlur={() => setTimeout(() => setShowActions(false), 150)}
                  >
                    <MoreHorizontal className="w-5 h-5" />
                  </button>
                  {showActions && (
                    <div className="absolute right-0 top-full mt-1 bg-background border border-border rounded-lg shadow-lg z-10 py-1 min-w-[100px]">
                      <Link
                        href={`/teams/${params.id}/assignments/${params.assignmentId}/edit`}
                        className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-foreground transition-colors"
                      >
                        <Edit className="w-4 h-4" /> 编辑
                      </Link>
                      <button className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted text-error transition-colors">
                        <Trash2 className="w-4 h-4" /> 删除
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            {assignment.description && (
              <p className="mt-2 text-sm text-muted-foreground">{assignment.description}</p>
            )}
          </div>

          <div className="px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm border-b border-border">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">开始</span>
              <span className="font-medium text-foreground">{new Date(assignment.startTime).toLocaleString('zh-CN')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">截止</span>
              <span className="font-medium text-foreground">{new Date(assignment.endTime).toLocaleString('zh-CN')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <FileCode className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">题目数</span>
              <span className="font-medium text-foreground">{assignment.problems?.length || 0}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-secondary-light" />
              <span className="text-muted-foreground">已完成</span>
              <span className="font-medium text-foreground">{submissions.filter(s => s.status === 'AC').length}/{assignment.problems?.length || 0}</span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-card rounded-xl border border-border overflow-hidden shadow-sm">
          <div className="flex border-b border-border">
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 px-5 py-3 font-medium text-sm transition-all relative ${
                    activeTab === tab.key
                      ? 'text-primary-light'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className={`w-4 h-4`} />
                  {tab.label}
                  {activeTab === tab.key && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
                  )}
                </button>
              )
            })}
          </div>

          <div className="p-5">
            {activeTab === 'problems' && (
              <div className="space-y-4">
                {assignment.problems && assignment.problems.length > 0 ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      {assignment.problems.map((problem, index) => {
                        const status = getProblemStatus(problem.id)
                        const isActive = index === selectedProblemIndex
                        const letter = LETTERS[index]
                        return (
                          <button
                            key={problem.id}
                            onClick={() => setSelectedProblemIndex(index)}
                            className={`relative w-10 h-10 rounded-lg font-mono font-bold text-sm transition-all duration-200 border ${
                              isActive
                                ? 'bg-primary text-white border-primary shadow-md scale-105'
                                : status?.status === 'AC'
                                  ? 'bg-secondary/10 text-secondary border-secondary/30 hover:border-secondary/50'
                                  : status
                                    ? 'bg-warning/10 text-warning border-warning/30 hover:border-warning/50'
                                    : 'bg-muted/50 text-muted-foreground border-border hover:border-primary/30 hover:text-foreground'
                            }`}
                            title={`${letter}. ${problem.title}`}
                          >
                            {letter}
                            {status?.status === 'AC' && (
                              <span className="absolute -top-1 -right-1 w-3 h-3 bg-secondary rounded-full border-[1.5px] border-white dark:border-card" />
                            )}
                          </button>
                        )
                      })}
                    </div>

                    <div className="border border-border rounded-xl overflow-hidden">
                      <div className="px-4 py-3 bg-muted/30 border-b border-border flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="shrink-0 w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center font-mono text-sm font-bold text-primary-light">
                            {LETTERS[selectedProblemIndex]}
                          </span>
                          <h2 className="font-semibold text-foreground truncate">{selectedProblem?.title}</h2>
                          {selectedProblem && (
                            <span className={`shrink-0 px-1.5 py-0.5 rounded text-[11px] font-medium border ${getDifficultyColor(selectedProblem.difficulty)}`}>
                              {selectedProblem.difficulty}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 shrink-0 ml-4">
                          {selectedProblemStatus ? (
                            selectedProblemStatus.status === 'AC' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-secondary/15 text-secondary">
                                <CheckCircle2 className="w-3 h-3" /> 通过 ({selectedProblemStatus.score}分)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium text-accent">
                                {selectedProblemStatus.score}分
                              </span>
                            )
                          ) : (
                            <span className="text-xs text-muted-foreground/60">未提交</span>
                          )}
                        </div>
                      </div>

                      <div className="divide-y divide-border/60">
                        {problemLoading ? (
                          <div className="p-12 text-center">
                            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3" />
                            <span className="text-sm text-muted-foreground">加载题目内容...</span>
                          </div>
                        ) : problemDetail ? (
                          <>
                            <div className="p-5">
                              <ProblemDescription problem={problemDetail} />
                            </div>

                            <div className="px-5 pb-5 space-y-3">
                              {!user && (
                                <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-accent text-sm flex items-center gap-2">
                                  <AlertCircle className="w-4 h-4 shrink-0" />
                                  请先登录后再提交代码
                                </div>
                              )}

                              <div className="flex items-center justify-between gap-4">
                                <label className="text-sm font-medium text-foreground whitespace-nowrap">语言</label>
                                <select
                                  value={language}
                                  onChange={(e) => setLanguage(e.target.value)}
                                  className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                                >
                                  {languageOptions.map((lang) => (
                                    <option key={lang.value} value={lang.value}>
                                      {lang.label} ({lang.version})
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <textarea
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                className="w-full h-[320px] rounded-xl bg-slate-900 text-slate-100 font-mono text-sm p-4 border border-border hover:border-primary/30 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 resize-y transition-colors"
                                spellCheck={false}
                                placeholder="在此粘贴或输入代码..."
                              />

                              <div className="min-h-[44px]">
                                {submitting && judgeStatus && (
                                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 animate-fadeIn">
                                    <div className="flex items-center gap-3">
                                      <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                                      <span className="text-sm text-foreground">正在评测...</span>
                                      {judgeProgress && (
                                        <span className="text-xs text-muted-foreground">
                                          ({judgeProgress.currentTest}/{judgeProgress.totalTests})
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {lastResult && !submitting && (
                                  <div className={`p-3 rounded-lg border transition-all ${
                                    lastResult.status === 'AC'
                                      ? 'bg-secondary/5 border-secondary/20'
                                      : 'bg-error/5 border-error/20'
                                  }`}>
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-3">
                                        {lastResult.status === 'AC' ? (
                                          <CheckCircle2 className="w-5 h-5 text-secondary" />
                                        ) : (
                                          <XCircle className="w-5 h-5 text-error" />
                                        )}
                                        <span className={`text-sm font-medium ${lastResult.status === 'AC' ? 'text-secondary' : 'text-error'}`}>
                                          {lastResult.status}
                                        </span>
                                        <span className="text-sm text-muted-foreground">
                                          得分: {lastResult.score}
                                        </span>
                                      </div>
                                      <button
                                        onClick={() => setLastResult(null)}
                                        className="p-1 rounded hover:bg-muted transition-colors"
                                      >
                                        <X className="w-4 h-4 text-muted-foreground" />
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-3 pt-1">
                                <button
                                  onClick={handleSubmit}
                                  disabled={submitting || submitCooldown || !user}
                                  title={
                                    !user ? '请先登录' :
                                    submitting ? '正在评测中...' :
                                    submitCooldown ? '请稍后再试' : ''
                                  }
                                  className="btn-primary btn flex-1 max-w-xs"
                                >
                                  {submitting ? (
                                    <>
                                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                      评测中...
                                    </>
                                  ) : submitCooldown ? (
                                    <>
                                      <Clock className="w-4 h-4" />
                                      请稍候...
                                    </>
                                  ) : !user ? (
                                    <>
                                      <Send className="w-4 h-4" />
                                      请先登录
                                    </>
                                  ) : (
                                    <>
                                      <Send className="w-4 h-4" />
                                      提交代码
                                    </>
                                  )}
                                </button>
                                <button
                                  onClick={() => setCode('')}
                                  className="btn-ghost btn cursor-pointer"
                                >
                                  清空
                                </button>
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="p-12 text-center text-sm text-muted-foreground">
                            题目内容加载失败
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="py-16 text-center text-sm text-muted-foreground">暂无题目</div>
                )}
              </div>
            )}

            {activeTab === 'ranking' && isAdminOrOwner && (
              <StudentCompletionTable
                students={teamMembers.map((member, index) => {
                  const memberSubs = allSubmissions.filter(s => s.userId === member.userId)
                  const submissionsMap: Record<string, any> = {}
                  let totalScore = 0
                  let completedCount = 0

                  memberSubs.forEach(sub => {
                    const existing = submissionsMap[sub.problemId]
                    if (!existing || sub.score > (existing.score || 0)) {
                      submissionsMap[sub.problemId] = {
                        problemId: sub.problemId,
                        status: sub.status,
                        score: sub.score || 0,
                        submittedAt: sub.submittedAt
                      }
                    }
                  })

                  Object.values(submissionsMap).forEach((sub: any) => {
                    totalScore += sub.score || 0
                    if (sub.status === 'AC') completedCount++
                  })

                  return {
                    id: member.userId,
                    name: member.nickname || member.username || `成员${index + 1}`,
                    avatar: member.avatar || '',
                    submissions: submissionsMap,
                    totalScore,
                    completedCount
                  }
                })}
                problems={assignment.problems || []}
                assignmentTitle={assignment.title}
                allSubmissions={allSubmissions}
                onProblemClick={(index) => {
                  setSelectedProblemIndex(index)
                  setActiveTab('problems')
                  setCode('')
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
