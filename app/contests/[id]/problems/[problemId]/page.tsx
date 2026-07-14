'use client'

import { useState, useEffect, use, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useProblemDocumentTitle } from '@/hooks/useProblemDocumentTitle'
import {
  AlertCircle,
  CheckCircle2,
  XCircle,
  BookOpen,
  ListChecks,
  X,
} from 'lucide-react'
import { useUser } from '@/contexts/UserContext'
import { useSubmissionSocket } from '@/hooks/useSubmissionSocket'
import { fetchWithCookie } from '@/lib/api/base'
import { logger } from '@/lib/logger'
import { getStatusColor } from '@/lib/status'
import ProblemDescription from '@/components/problem/ProblemDescription'
import SubmissionList from '@/components/problem/SubmissionList'
import { useContestProblemWorkspace } from '@/contexts/ContestProblemWorkspaceContext'
import type { Problem } from '@/types/models'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

export default function ContestProblemDetailPage({
  params,
}: {
  params: Promise<{ id: string; problemId: string }>
}) {
  const { id: contestId, problemId } = use(params)
  const router = useRouter()
  const { user } = useUser()
  const ws = useContestProblemWorkspace()

  const [problem, setProblem] = useState<Problem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const {
    contestProblems,
    contestTitle,
    refreshContestProblems,
    submitting,
    setSubmitting,
    submitResult,
    setSubmitResult,
    judgeStatus,
    setJudgeStatus,
    setShowJudgeStatus,
    judgeProgress,
    setJudgeProgress,
    lastResult,
    setLastResult,
    currentSubmissionId,
    setCurrentSubmissionId,
    activeTab,
    setActiveTab,
    submissions,
    setSubmissions,
    submissionsLoading,
    setSubmissionsLoading,
    code,
    language,
    registerSubmitHandler,
  } = ws

  const currentSubmissionIdRef = useRef<string | null>(null)
  useEffect(() => {
    currentSubmissionIdRef.current = currentSubmissionId
  }, [currentSubmissionId])

  // 防重复提交：用 ref 同步守卫，避免 React state 异步更新间隙双击绕过 disabled
  const submittingRef = useRef(false)
  useEffect(() => {
    submittingRef.current = submitting
  }, [submitting])

  const safeIndex = contestProblems.findIndex((p) => p.id === problemId)
  const currentMeta = safeIndex >= 0 ? contestProblems[safeIndex] : undefined

  const titleContext = useMemo(
    () => ({
      kind: 'contest' as const,
      label: currentMeta?.label || LETTERS[0],
      contestTitle: contestTitle || undefined,
    }),
    [currentMeta?.label, contestTitle]
  )
  useProblemDocumentTitle(problem?.title, titleContext)

  const fetchProblem = async () => {
    try {
      setLoading(true)
      setError('')
      const res = await fetchWithCookie(`/api/problems/${problemId}`)
      const data = await res.json()
      if (data.success) {
        setProblem(data.data)
      } else {
        setError(data.error || '获取题目失败')
      }
    } catch {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }

  const fetchSubmissions = async () => {
    try {
      setSubmissionsLoading(true)
      const res = await fetchWithCookie(
        `/api/contests/${contestId}/submissions?problemId=${problemId}&userId=${user?.id || ''}`,
        { cache: 'no-store' }
      )
      const data = await res.json()
      if (data.success) {
        setSubmissions(data.data.submissions || [])
      } else {
        setSubmissions([])
      }
    } catch (err) {
      logger.error('Fetch submissions failed', err)
      setSubmissions([])
    } finally {
      setSubmissionsLoading(false)
    }
  }

  useEffect(() => {
    fetchProblem()
    setSubmitResult(null)
    setLastResult(null)
    setShowJudgeStatus(false)
    setJudgeStatus(null)
  }, [problemId])

  useEffect(() => {
    if (activeTab === 'submissions') {
      fetchSubmissions()
    }
  }, [activeTab, contestId, problemId, user?.id])

  useEffect(() => {
    if (!submitting) return
    if (!Array.isArray(submissions) || submissions.length === 0) return
    const latest = submissions[0]
    const status = latest?.status
    if (status && status !== 'Pending' && status !== 'Judging' && status !== 'Running') {
      setSubmitting(false)
      setJudgeProgress(null)
      setSubmitResult({
        type: status === 'AC' || status === 'Accepted' ? 'success' : 'error',
        text: `评测完成：${status}`,
        id: latest.id,
      })
      setLastResult({
        status,
        score: typeof latest.score === 'number' ? latest.score : 0,
      })
      refreshContestProblems()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissions, submitting])

  useSubmissionSocket({
    userId: user?.id || '',
    enabled: !!user,
    onSubmissionUpdate: (data) => {
      if (data?.id) {
        setSubmissions((prev) => {
          if (!Array.isArray(prev)) return prev
          const index = prev.findIndex((s) => s.id === data.id)
          if (index !== -1) {
            const next = prev.slice()
            next[index] = { ...next[index], ...data }
            return next
          }
          return prev
        })
      }

      const isFinal =
        data.status !== 'Pending' && data.status !== 'Judging' && data.status !== 'Running'
      if (isFinal) {
        setSubmitting(false)
        setJudgeProgress(null)
        setSubmitResult({
          type: data.status === 'AC' || data.status === 'Accepted' ? 'success' : 'error',
          text: `评测完成：${data.status}`,
          id: data.id,
        })
        setLastResult({
          status: data.status,
          score: typeof data.score === 'number' ? data.score : 0,
        })
        fetchSubmissions()
        refreshContestProblems()
      }

      if (data.id === currentSubmissionIdRef.current) {
        setJudgeStatus({
          submissionId: data.id,
          status: data.status,
          passedTests: data.passedTests || 0,
          totalTests: data.totalTests || 0,
          testResults: data.testResults || [],
        })
        setShowJudgeStatus(true)
      }
    },
    onJudgeProgress: (data) => {
      if (data?.submissionId === currentSubmissionIdRef.current) {
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
          setShowJudgeStatus(true)
        }
      }
    },
  })

  useEffect(() => {
    registerSubmitHandler(async () => {
      if (!user) {
        router.push(`/login?redirect=/contests/${contestId}/problems/${problemId}`)
        return
      }
      if (!code.trim()) {
        setSubmitResult({ type: 'error', text: '代码不能为空' })
        return
      }
      // 防重复提交：用 ref 同步守卫
      if (submittingRef.current) return
      submittingRef.current = true
      try {
        setSubmitting(true)
        setSubmitResult(null)
        setLastResult(null)
        setShowJudgeStatus(false)

        const res = await fetchWithCookie(`/api/contests/${contestId}/submissions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ problemId, code, language }),
        })
        const data = await res.json()

        if (data.success) {
          setSubmitResult({
            type: 'success',
            text: '提交成功，正在评测...',
            id: data.submissionId,
          })
          setCurrentSubmissionId(data.submissionId)
          setActiveTab('submissions')
          fetchSubmissions()
        } else {
          setSubmitResult({ type: 'error', text: data.error || '提交失败' })
          submittingRef.current = false
          setSubmitting(false)
        }
      } catch {
        setSubmitResult({ type: 'error', text: '网络错误' })
        submittingRef.current = false
        setSubmitting(false)
      }
    })
  }, [
    registerSubmitHandler,
    user,
    code,
    language,
    problemId,
    contestId,
    router,
    setSubmitting,
    setSubmitResult,
    setLastResult,
    setShowJudgeStatus,
    setCurrentSubmissionId,
    setActiveTab,
  ])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
            <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
          <p className="text-muted-foreground text-lg">加载题目中...</p>
        </div>
      </div>
    )
  }

  if (error || !problem) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center card-static rounded-lg p-12 max-w-md">
          <AlertCircle className="w-8 h-8 text-error mx-auto mb-4" />
          <p className="text-error text-lg mb-6">{error || '题目不存在'}</p>
          <button type="button" onClick={() => router.back()} className="btn btn-primary">
            返回
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {submitting && judgeStatus && (
        <div className="mb-4 p-4 rounded-xl bg-muted border border-border animate-fadeIn">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              <span className="text-foreground">正在评测...</span>
              {judgeProgress && (
                <span className="text-muted-foreground text-sm">
                  ({judgeProgress.currentTest}/{judgeProgress.totalTests})
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setJudgeStatus(null)}
              className="p-1 hover:bg-muted rounded"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      )}

      {lastResult && !submitting && (
        <div
          className={`mb-4 p-4 rounded-xl border animate-fadeIn ${
            lastResult.status === 'AC' || lastResult.status === 'Accepted'
              ? 'bg-secondary/10 border-green-500/20'
              : 'bg-error/10 border-red-500/20'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {lastResult.status === 'AC' || lastResult.status === 'Accepted' ? (
                <CheckCircle2 className="w-5 h-5 text-green-400" />
              ) : (
                <XCircle className="w-5 h-5 text-red-400" />
              )}
              <span className={`font-medium ${getStatusColor(lastResult.status)}`}>
                {lastResult.status}
              </span>
              <span className="text-muted-foreground">得分: {lastResult.score}</span>
            </div>
            <button type="button" onClick={() => setLastResult(null)} className="p-1 hover:bg-muted rounded">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      )}

      <div className="card-static rounded-lg overflow-hidden">
        <div className="flex border-b border-border overflow-x-auto">
          {[
            { key: 'description', label: '题目描述', icon: BookOpen },
            { key: 'submissions', label: '提交记录', icon: ListChecks },
          ].map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key as typeof activeTab)}
                className={`flex items-center gap-2 px-5 py-3.5 font-medium relative whitespace-nowrap ${
                  activeTab === tab.key ? 'text-primary-light' : 'text-muted-foreground'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {activeTab === tab.key && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
                )}
              </button>
            )
          })}
        </div>

        <div className="p-6">
          {activeTab === 'description' && <ProblemDescription problem={problem} />}
          {activeTab === 'submissions' && (
            <SubmissionList
              submissions={submissions}
              loading={submissionsLoading}
              error={null}
              user={user}
              fromAssignment={null}
              classId={null}
              onSelect={() => {}}
            />
          )}
        </div>
      </div>
    </div>
  )
}