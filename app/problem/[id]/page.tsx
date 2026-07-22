'use client'

import { useState, useEffect, useRef, use, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpen,
  Send,
  AlertCircle,
  AlertTriangle,
  Wifi,
  XCircle,
  Code as CodeIcon,
  CheckCircle2,
  FileCode,
  FileText,
  History,
  MessageSquare,
  ListChecks,
  Edit3,
  BarChart3
} from 'lucide-react'
import { getStatusColor } from '@/lib/status'
import { useRouter, useSearchParams } from 'next/navigation'
import { useUser } from '@/contexts/UserContext'
import { useSubmissionSocket } from '@/hooks/useSubmissionSocket'
import ProblemDescription from '@/components/problem/ProblemDescription'
import ProblemWorkspaceShell from '@/components/problem/ProblemWorkspaceShell'
import ProblemMetaHeader from '@/components/problem/ProblemMetaHeader'
import SubmissionList from '@/components/problem/SubmissionList'
import SolutionTabPanel from '@/components/problem/SolutionTabPanel'
import ProblemStatsPanel from '@/components/problem/ProblemStatsPanel'
import PretestPanel from '@/components/problem/PretestPanel'
import SubmissionResultModal, { SubmissionResultData } from '@/components/submission/SubmissionResultModal'
import { fetchWithCookie } from '@/lib/api/base'
import { logger } from '@/lib/logger'
import { canManageContent } from '@/lib/permissions'
import { formatDateTime } from '@/lib/utils'
import Link from 'next/link'
import { useProblemDocumentTitle } from '@/hooks/useProblemDocumentTitle'
import toast from 'react-hot-toast'
import CodeEditor, { CodeLanguage } from '@/components/code-editor/CodeEditor'
import { PageContainer } from '@/components/layout'

const languageOptions = [
  { value: 'cpp', label: 'C++', version: 'C++17' },
  { value: 'c', label: 'C', version: 'C11' },
  { value: 'python', label: 'Python', version: 'Python 3.10' },
]

function getStorageKey(problemId: string, classId: string | null, assignmentId: string | null): string {
  if (classId && assignmentId) {
    return `code_class_${classId}_${assignmentId}_${problemId}`
  }
  return `code_problem_${problemId}`
}

function getLanguageStorageKey(problemId: string, classId: string | null, assignmentId: string | null): string {
  if (classId && assignmentId) {
    return `lang_class_${classId}_${assignmentId}_${problemId}`
  }
  return `lang_problem_${problemId}`
}

export default function ProblemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: problemId } = use(params)
  
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useUser()
  
  const fromAssignment = searchParams.get('fromAssignment')
  const classId = searchParams.get('classId')
  const assignmentTitle = searchParams.get('assignmentTitle')
  const returnTab = searchParams.get('returnTab') || 'info'
  const fromTraining = searchParams.get('from') === 'training'
  const trainingId = searchParams.get('trainingId')
  const trainingTitle = searchParams.get('trainingTitle')
  const classNameParam = searchParams.get('className')

  const isAssignmentContext = fromAssignment === '1'
  
  const [code, setCode] = useState('')
  const [language, setLanguage] = useState('cpp')
  const [activeTab, setActiveTab] = useState<'description' | 'solutions' | 'submissions' | 'stats' | 'code'>('description')
  const [submitting, setSubmitting] = useState(false)
  const [currentSubmissionId, setCurrentSubmissionId] = useState<string | null>(null)
  const [judgeStatus, setJudgeStatus] = useState<any>(null)
  const [judgeProgress, setJudgeProgress] = useState<{ currentTest: number; totalTests: number } | null>(null)
  const [lastResult, setLastResult] = useState<SubmissionResultData | null>(null)
  const [showResultModal, setShowResultModal] = useState(false)
  
  const [problem, setProblem] = useState<any>(null)
  const [problemLoading, setProblemLoading] = useState(true)
  const [problemError, setProblemError] = useState<string | null>(null)
  
  const [submissions, setSubmissions] = useState<any[]>([])
  const [submissionsLoading, setSubmissionsLoading] = useState(false)
  const [selectedSubmission, setSelectedSubmission] = useState<any>(null)

  // 是否可编辑题目（SYSTEM_ADMIN / ADMIN / TEACHER）
  const canEditProblem = canManageContent(user)

  const titleContext = useMemo(() => {
    if (fromAssignment && classId) {
      return {
        kind: 'assignment' as const,
        assignmentTitle: assignmentTitle || undefined,
      }
    }
    if (fromTraining) {
      return {
        kind: 'training' as const,
        trainingTitle: trainingTitle || undefined,
      }
    }
    if (classId || classNameParam) {
      return {
        kind: 'class' as const,
        className: classNameParam || undefined,
      }
    }
    return {
      kind: 'library' as const,
      problemNumber: problem?.problemNumber ?? undefined,
    }
  }, [
    fromAssignment,
    classId,
    assignmentTitle,
    fromTraining,
    trainingTitle,
    classNameParam,
    problem?.problemNumber,
  ])

  useProblemDocumentTitle(problem?.title, titleContext)

  useEffect(() => {
    const fetchProblem = async () => {
      try {
        setProblemLoading(true)
        setProblemError(null)
        
        const response = await fetchWithCookie(`/api/problems/${problemId}`)
        const data = await response.json()
        
        if (data.success) {
          setProblem(data.data)
        } else {
          setProblemError(data.error || '获取题目失败')
        }
      } catch (error) {
        setProblemError('网络错误')
      } finally {
        setProblemLoading(false)
      }
    }
    
    fetchProblem()
  }, [problemId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    // 等 API 返回真实内部 id 后再读写 localStorage
    // 用 problem.id（ObjectId）而非 URL 中的 problemId（可能是题号 P1001），
    // 这样删除题目重建后 ObjectId 变化，旧草稿自动失效，不会看到"幽灵代码"
    if (!problem?.id) return

    const codeKey = getStorageKey(problem.id, classId, fromAssignment)
    const savedCode = localStorage.getItem(codeKey)
    if (savedCode) {
      setCode(savedCode)
    } else {
      setCode('')
    }

    const langKey = getLanguageStorageKey(problem.id, classId, fromAssignment)
    const savedLang = localStorage.getItem(langKey)
    if (savedLang && languageOptions.some(l => l.value === savedLang)) {
      setLanguage(savedLang)
    } else {
      setLanguage('cpp')
    }
  }, [problem?.id, classId, fromAssignment])

  useEffect(() => {
    if (isAssignmentContext && activeTab === 'solutions') {
      setActiveTab('description')
    }
  }, [isAssignmentContext, activeTab])

  useEffect(() => {
    if (typeof window === 'undefined' || !problem?.id) return
    // 允许写入空字符串：用户点"清空"按钮后 code 变为 ''，
    // 同步把 localStorage 草稿也清掉，避免下次刷新又读回来
    const codeKey = getStorageKey(problem.id, classId, fromAssignment)
    localStorage.setItem(codeKey, code)
  }, [code, problem?.id, classId, fromAssignment])

  useEffect(() => {
    if (typeof window === 'undefined' || !problem?.id) return

    const langKey = getLanguageStorageKey(problem.id, classId, fromAssignment)
    localStorage.setItem(langKey, language)
  }, [language, problem?.id, classId, fromAssignment])

  // 桌面端（>= 1024px）不允许停留在 'code' tab，避免左栏内容为空
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024 && activeTab === 'code') {
        setActiveTab('description')
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [activeTab])
  
  // 用 ref 跟踪当前提交 ID，避免回调闭包拿到陈旧值
  const currentSubmissionIdRef = useRef<string | null>(null)
  useEffect(() => {
    currentSubmissionIdRef.current = currentSubmissionId
  }, [currentSubmissionId])

  // 用 ref 跟踪 submitting 状态，避免回调闭包拿到陈旧值
  const submittingRef = useRef(false)
  useEffect(() => {
    submittingRef.current = submitting
  }, [submitting])

  const fetchSubmissions = async () => {
    try {
      setSubmissionsLoading(true)
      
      let url: string
      if (fromAssignment && classId) {
        url = `/api/classes/${classId}/assignments/${fromAssignment}/submissions?problemId=${problemId}`
        
        const response = await fetchWithCookie(url, { cache: 'no-store' })
        const data = await response.json()
        
        if (data.success) {
          setSubmissions(data.data.submissions || [])
        } else {
          setSubmissions([])
        }
      } else {
        // 提交记录需登录后查看；未登录直接显示空列表，由 SubmissionList 引导登录
        // API 已强制普通用户仅能查询自己的提交（userId = 当前用户）
        if (!user) {
          setSubmissions([])
          return
        }
        url = `/api/problems/${problemId}/submissions?userId=${user.id}`
        
        const response = await fetchWithCookie(url, { cache: 'no-store' })
        const data = await response.json()
        
        if (data.success) {
          setSubmissions(data.data.submissions || [])
        } else {
          setSubmissions([])
        }
      }
    } catch (error) {
      logger.error('获取提交记录失败', error)
    } finally {
      setSubmissionsLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'submissions') {
      fetchSubmissions()
    }
  }, [activeTab, problemId, user, fromAssignment, classId])

  // 轮询兜底：只要在"提交记录" tab 且有非终态提交，就每 5s 拉一次。
  // 解决 WebSocket 断连 / 漏推 / 跨标签页 等场景下前端永远不刷新的问题。
  // 用 ref 跟踪 hasNonFinal，避免 submissions 变化导致 interval 反复重建（曾经的 bug：
  // 每次 WS 乐观更新 setSubmissions → effect 重建 setInterval → 3s 后 fetchSubmissions →
  // 再次 setSubmissions → 再次重建 → 形成高频刷新循环）。
  const hasNonFinalRef = useRef(false)
  useEffect(() => {
    hasNonFinalRef.current = submissions.some(
      (s) => s?.status === 'Pending' || s?.status === 'Judging' || s?.status === 'Running'
    )
  }, [submissions])

  useEffect(() => {
    if (activeTab !== 'submissions') return

    let intervalId: ReturnType<typeof setInterval> | null = null
    const start = () => {
      if (intervalId) return
      intervalId = setInterval(() => {
        // 每次轮询前检查 ref，若已全部终态则停止（避免无意义请求）
        if (!hasNonFinalRef.current) {
          stop()
          return
        }
        fetchSubmissions()
      }, 5000)
    }
    const stop = () => {
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
      }
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // 切回页面时立即刷新一次（若仍有非终态），再启动轮询
        if (hasNonFinalRef.current) {
          fetchSubmissions()
          start()
        } else {
          stop()
        }
      } else {
        stop()
      }
    }

    // 初始：若有非终态提交且页面可见，启动轮询
    if (hasNonFinalRef.current && document.visibilityState === 'visible') {
      start()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  // 兜底：只要当前提交已经是终态，就把"评测中..."按钮重置回"提交"。
  // 解决 ref 跟 data.id 没对上、tab 切换、refetch 时机错位 等场景下
  // submitting 卡在 true 不下来的问题。
  useEffect(() => {
    if (!submitting) return
    if (!Array.isArray(submissions) || submissions.length === 0) return
    const currentId = currentSubmissionIdRef.current
    if (!currentId) return
    const current = submissions.find((s) => s?.id === currentId)
    if (!current) return
    const status = current.status
    if (status && status !== 'Pending' && status !== 'Judging' && status !== 'Running') {
      setSubmitting(false)
      setJudgeProgress(null)
      if (!lastResult || lastResult.status !== status) {
        setLastResult({
          submissionId: current.id,
          status,
          score: typeof current.score === 'number' ? current.score : 0,
          time: typeof current.time === 'number' ? current.time : 0,
          memory: typeof current.memory === 'number' ? current.memory : 0,
          passedTests: typeof current.passedTests === 'number' ? current.passedTests : 0,
          totalTests: typeof current.totalTests === 'number' ? current.totalTests : 0,
          message: current.message ?? null,
          testResults: Array.isArray(current.testResults) ? current.testResults : undefined,
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissions, submitting])

  const { isConnected } = useSubmissionSocket({
    userId: user?.id || '',
    enabled: !!user,
    onSubmissionUpdate: (data) => {
      // 1) 乐观更新提交列表：让"提交记录" tab 立即反映出最新状态，
      //    无需等待服务器再次回包 / 不依赖 currentSubmissionId 是否对得上。
      //    不再额外触发 fetchSubmissions() —— 乐观更新已更新列表，
      //    轮询 effect 会在有非终态提交时定期兜底刷新，避免每个 WS 事件都打一次 API。
      if (data?.id) {
        setSubmissions((prev) => {
          if (!Array.isArray(prev)) return prev
          const idx = prev.findIndex((s) => s?.id === data.id)
          if (idx === -1) {
            // 列表里还没这条记录：可能是刚提交但还没拉过列表。
            // 若是终态事件，插入到列表头部；若是中间态，也插入以便轮询跟踪。
            if (data.status && data.status !== 'Pending' && data.status !== 'Judging' && data.status !== 'Running') {
              return [
                {
                  id: data.id,
                  status: data.status,
                  score: data.score,
                  time: data.time,
                  memory: data.memory,
                  passedTests: data.passedTests,
                  totalTests: data.totalTests,
                  message: data.message,
                  language: language,
                  submittedAt: new Date().toISOString(),
                },
                ...prev,
              ]
            }
            return prev
          }
          const next = prev.slice()
          next[idx] = {
            ...next[idx],
            status: data.status,
            score: typeof data.score === 'number' ? data.score : next[idx].score,
            time: typeof data.time === 'number' ? data.time : next[idx].time,
            memory: typeof data.memory === 'number' ? data.memory : next[idx].memory,
            passedTests: typeof data.passedTests === 'number' ? data.passedTests : next[idx].passedTests,
            totalTests: typeof data.totalTests === 'number' ? data.totalTests : next[idx].totalTests,
            message: data.message ?? next[idx].message,
          }
          return next
        })
      }

      // 2) 判断是否是终态
      const isFinal = data.status !== 'Pending' && data.status !== 'Judging' && data.status !== 'Running'

      // 3) 用 submitting 状态作为门控：提交后到收到终态之间，submitting 为 true。
      //    不依赖 currentSubmissionIdRef（它通过 useEffect 异步同步，可能有时序问题）。
      const isCurrentSubmission = submittingRef.current

      // 4) 收到任何"终态"事件都重置"评测中..."按钮
      if (isFinal) {
        setSubmitting(false)
        setJudgeProgress(null)
      }

      // 5) 只在是当前提交时，才设置弹窗状态（避免其他提交事件触发弹窗）
      if (isCurrentSubmission) {
        if (isFinal) {
          setLastResult({
            submissionId: data.id,
            status: data.status,
            score: typeof data.score === 'number' ? data.score : 0,
            time: typeof data.time === 'number' ? data.time : 0,
            memory: typeof data.memory === 'number' ? data.memory : 0,
            passedTests: typeof data.passedTests === 'number' ? data.passedTests : 0,
            totalTests: typeof data.totalTests === 'number' ? data.totalTests : 0,
            message: data.message ?? null,
            testResults: Array.isArray(data.testResults) ? data.testResults : undefined,
          })
        }
        setJudgeStatus({
          submissionId: data.id,
          status: data.status,
          passedTests: data.passedTests || 0,
          totalTests: data.totalTests || 0,
          testResults: data.testResults || [],
        })
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
        }
      }
    }
  })

  const handleSubmit = async () => {
    if (!user) {
      router.push('/login')
      return
    }

    if (!code.trim() || code.trim().length < 10) {
      toast.error('代码不能为空或少于10个字符')
      return
    }

    // 防重复提交：用 ref 同步守卫，避免 React state 异步更新间隙双击绕过 disabled
    if (submittingRef.current) return
    submittingRef.current = true

    setSubmitting(true)
    setJudgeStatus(null)
    setJudgeProgress(null)
    setLastResult(null)
    setShowResultModal(true)

    try {
      let submitUrl: string
      let submitBody: any

      if (fromAssignment && classId) {
        submitUrl = `/api/classes/${classId}/assignments/${fromAssignment}/submit`
        submitBody = { problemId, code, language }
      } else {
        submitUrl = '/api/submissions'
        submitBody = { problemId, code, language }
      }

      const response = await fetchWithCookie(submitUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(submitBody)
      })

      const data = await response.json()

      if (data.success) {
        currentSubmissionIdRef.current = data.submissionId
        setCurrentSubmissionId(data.submissionId)
        setActiveTab('submissions')
      } else {
        submittingRef.current = false
        setSubmitting(false)
        setShowResultModal(false)
        toast.error(data.error || '提交失败')
      }
    } catch (error) {
      submittingRef.current = false
      setSubmitting(false)
      setShowResultModal(false)
      toast.error('网络错误，请稍后重试')
    }
  }

  const handleLanguageChange = (newLang: string) => {
    setLanguage(newLang)
  }

  const handleClearCode = () => {
    setCode('')
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        if (!submittingRef.current && user && code.trim().length >= 10) {
          handleSubmit()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [user, code])



  if (problemLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20"></div>
            <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
          </div>
          <p className="text-muted-foreground text-lg">加载题目中...</p>
        </div>
      </div>
    )
  }

  if (problemError || !problem) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center card-static rounded-lg p-12 max-w-md">
          <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-error" />
          </div>
          <p className="text-error text-lg mb-6">{problemError || '题目不存在'}</p>
          <button onClick={() => router.back()} className="btn-primary btn" type="button">
            返回
          </button>
        </div>
      </div>
    )
  }

  const acceptRate = problem.totalSubmit > 0 
    ? ((problem.totalAccepted / problem.totalSubmit) * 100).toFixed(1) 
    : '0.0'

  return (
    <div className="min-h-screen pb-20 lg:pb-8">
      <PageContainer className="pt-6">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <span className="font-mono text-sm font-bold text-primary-light bg-primary/10 px-3 py-1 rounded-lg">
            {problem.problemNumber || problem.id}
          </span>
          <h1 className="text-xl font-bold text-foreground md:text-2xl">{problem.title}</h1>
          {canEditProblem && problem?.id && (
            <Link
              href={`/admin/problems/${problem.id}/edit`}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium text-primary-light hover:bg-primary/10 transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" /> 编辑
            </Link>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4 mb-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5 hover:text-primary-light transition-colors duration-300 group">
            <CheckCircle2 className="w-4 h-4 text-green-400 transition-transform duration-300" />
            <span>通过率 {acceptRate}%</span>
          </div>
          <div className="flex items-center gap-1.5 hover:text-primary-light transition-colors duration-300 group">
            <FileCode className="w-4 h-4 transition-transform duration-300" />
            <span>{problem.totalSubmit?.toLocaleString() || '0'} 提交</span>
          </div>
          {user && isConnected && (
            <div className="flex items-center gap-1.5 text-xs text-green-400 hover:text-green-300 transition-colors duration-300 group">
              <Wifi className="w-3.5 h-3.5 transition-transform duration-300" />
              <span>实时连接</span>
            </div>
          )}
        </div>

        <ProblemWorkspaceShell
          codeMode={activeTab === 'code'}
          metaHeader={
            <ProblemMetaHeader
              timeLimit={problem.timeLimit}
              memoryLimit={problem.memoryLimit}
              tags={problem.tags}
              difficulty={problem.difficulty}
            />
          }
          leftHeader={
            <>
              {[
                { key: 'description', label: '题目描述', icon: BookOpen },
                { key: 'solutions', label: '题解', icon: MessageSquare },
                { key: 'submissions', label: '提交记录', icon: ListChecks },
                { key: 'stats', label: '统计', icon: BarChart3 },
              ]
                .filter((tab) => !(isAssignmentContext && tab.key === 'solutions'))
                .map((tab) => {
                  const Icon = tab.icon
                  const isActive = activeTab === tab.key
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key as typeof activeTab)}
                      className={`flex items-center gap-2 px-5 py-3.5 font-medium transition-all duration-300 relative cursor-pointer group whitespace-nowrap ${
                        isActive
                          ? 'text-primary-light'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="problem-tab-indicator"
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full"
                          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        />
                      )}
                      <Icon className={`w-4 h-4 transition-transform duration-300 ${isActive ? 'rotate-3' : ''}`} />
                      {tab.label}
                    </button>
                  )
                })}
            </>
          }
          leftPanel={
            <AnimatePresence mode="wait">
              {activeTab === 'description' && (
                <motion.div
                  key="description"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <ProblemDescription problem={problem} />
                </motion.div>
              )}

              {activeTab === 'solutions' && (
                <motion.div
                  key="solutions"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <SolutionTabPanel
                    problemId={problemId}
                    isAssignmentContext={isAssignmentContext}
                  />
                </motion.div>
              )}

              {activeTab === 'submissions' && (
                <motion.div
                  key="submissions"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <SubmissionList
                    submissions={submissions}
                    loading={submissionsLoading}
                    error={null}
                    user={user}
                    fromAssignment={fromAssignment}
                    classId={classId}
                    onSelect={(sub) => setSelectedSubmission(sub)}
                  />
                </motion.div>
              )}

              {activeTab === 'stats' && (
                <motion.div
                  key="stats"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <ProblemStatsPanel problemId={problemId} />
                </motion.div>
              )}
            </AnimatePresence>
          }
          rightHeader={
            <>
              <CodeIcon className="w-4 h-4 text-primary-light" />
              <h3 className="font-medium text-foreground">提交代码</h3>
            </>
          }
          rightPanel={
            <>
              {!user && (
                <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-accent-light hover:bg-yellow-500/15 hover:border-yellow-500/30 transition-all duration-300">
                  <div className="flex items-center gap-2 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    <span>请先登录后再提交代码</span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between gap-2">
                <label htmlFor="language-select" className="text-sm font-medium text-foreground">语言</label>
                <select
                  id="language-select"
                  value={language}
                  onChange={(e) => handleLanguageChange(e.target.value)}
                  className="input w-auto min-w-[140px] py-1.5 text-sm hover:border-primary/30 transition-colors duration-300"
                >
                  {languageOptions.map((lang) => (
                    <option key={lang.value} value={lang.value} className="bg-muted text-foreground">
                      {lang.label} ({lang.version})
                    </option>
                  ))}
                </select>
              </div>

              <CodeEditor
                value={code}
                onChange={setCode}
                language={language as CodeLanguage}
                placeholder="在此粘贴或输入代码... (Ctrl+Enter 提交)"
                height="420px"
                maxLength={65536}
                onSubmit={handleSubmit}
              />

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !user}
                  className="btn-primary btn flex-1 cursor-pointer group"
                >
                  {submitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      评测中...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 transition-transform duration-300 group-hover:rotate-12" />
                      提交
                    </>
                  )}
                </button>
                <button
                  onClick={handleClearCode}
                  className="btn-ghost btn cursor-pointer group"
                >
                  <span className="transition-colors duration-300 group-hover:text-primary-light">清空</span>
                </button>
              </div>

              {/* 在线测试（样例）：在正式提交前用题目样例运行代码，不影响提交记录 */}
              <PretestPanel
                problemId={problemId}
                code={code}
                language={language}
                disabled={!user || submitting}
              />
            </>
          }
        />
      </PageContainer>

      {selectedSubmission && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[110] animate-fadeIn"
          onClick={() => setSelectedSubmission(null)}
        >
          <div
            className="card-static rounded-lg max-w-3xl w-full max-h-[90vh] overflow-hidden shadow-2xl transition-all duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                <h3 className="font-semibold text-foreground">提交详情</h3>
              </div>
              <button
                onClick={() => setSelectedSubmission(null)}
                className="p-2 rounded-lg hover:bg-muted/50 transition-colors duration-300 group"
              >
                <XCircle className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors duration-300" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)] custom-scrollbar">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                <div className="card-static p-4">
                  <p className="text-xs text-muted-foreground mb-1">语言</p>
                  <p className="font-semibold text-foreground">{selectedSubmission.language}</p>
                </div>
                <div className="card-static p-4">
                  <p className="text-xs text-muted-foreground mb-1">状态</p>
                  <span className={`font-medium ${getStatusColor(selectedSubmission.status)}`}>
                    {selectedSubmission.status}
                  </span>
                </div>
                <div className="card-static p-4">
                  <p className="text-xs text-muted-foreground mb-1">得分</p>
                  <p className="font-semibold text-foreground">
                    {selectedSubmission.score}
                    {selectedSubmission.passedTests !== undefined && selectedSubmission.totalTests !== undefined && (
                      <span className="text-sm text-muted-foreground ml-1">
                        ({selectedSubmission.passedTests}/{selectedSubmission.totalTests})
                      </span>
                    )}
                  </p>
                </div>
                <div className="card-static p-4">
                  <p className="text-xs text-muted-foreground mb-1">耗时</p>
                  <p className="font-semibold text-foreground">{selectedSubmission.time}ms</p>
                </div>
                <div className="card-static p-4">
                  <p className="text-xs text-muted-foreground mb-1">内存</p>
                  <p className="font-semibold text-foreground">
                    {selectedSubmission.memory > 0
                      ? `${(selectedSubmission.memory / 1024).toFixed(2)}MB`
                      : '0MB'}
                  </p>
                </div>
                <div className="card-static p-4">
                  <p className="text-xs text-muted-foreground mb-1">提交时间</p>
                  <p className="font-semibold text-foreground text-sm">
                    {formatDateTime(selectedSubmission.submittedAt)}
                  </p>
                </div>
              </div>

              {selectedSubmission.code && (
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <CodeIcon className="w-4 h-4 text-primary-light" />
                    <h4 className="font-semibold text-foreground">代码</h4>
                  </div>
                  <div className="rounded-xl overflow-hidden border border-border">
                    <div className="px-4 py-2 bg-muted text-muted-foreground text-sm border-b border-border">
                      <span className="font-medium">{selectedSubmission.language}</span>
                    </div>
                    <pre className="bg-muted p-4 overflow-x-auto text-sm font-mono text-foreground">
                      <code>{selectedSubmission.code}</code>
                    </pre>
                  </div>
                </div>
              )}

              {selectedSubmission.message && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-error" />
                    <h4 className="font-semibold text-foreground">错误信息</h4>
                  </div>
                  <div className="bg-error/10 border border-error/20 rounded-xl p-4">
                    <pre className="text-sm text-error whitespace-pre-wrap">
                      {selectedSubmission.message}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <SubmissionResultModal
        isOpen={showResultModal}
        onClose={() => { setShowResultModal(false); setJudgeStatus(null); setLastResult(null); }}
        isJudging={submitting}
        judgeProgress={judgeProgress}
        result={lastResult as SubmissionResultData | null}
        onContinueSubmit={() => {
          // CodeMirror 的可编辑元素是 .cm-content，外层容器标记了 data-testid
          const cmContent = document.querySelector('[data-testid="code-editor-wrapper"] .cm-content') as HTMLElement | null;
          cmContent?.focus();
          setShowResultModal(false);
          setJudgeStatus(null);
          setLastResult(null);
        }}
        onViewDetail={(submissionId) => {
          setShowResultModal(false);
          setJudgeStatus(null);
          setLastResult(null);
          router.push(`/submission/${submissionId}`);
        }}
      />

      {/* 移动端底部 Tab Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-background-secondary border-t border-border z-40 lg:hidden">
        <div className="grid grid-cols-4">
          <button
            onClick={() => setActiveTab('description')}
            className={`flex flex-col items-center justify-center py-3 gap-1 ${activeTab === 'description' ? 'text-primary' : 'text-muted-foreground'}`}
          >
            <FileText className="w-5 h-5" />
            <span className="text-xs">题面</span>
          </button>
          <button
            onClick={() => setActiveTab('code')}
            className={`flex flex-col items-center justify-center py-3 gap-1 ${activeTab === 'code' ? 'text-primary' : 'text-muted-foreground'}`}
          >
            <CodeIcon className="w-5 h-5" />
            <span className="text-xs">代码</span>
          </button>
          <button
            onClick={() => setActiveTab('submissions')}
            className={`flex flex-col items-center justify-center py-3 gap-1 ${activeTab === 'submissions' ? 'text-primary' : 'text-muted-foreground'}`}
          >
            <History className="w-5 h-5" />
            <span className="text-xs">提交</span>
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`flex flex-col items-center justify-center py-3 gap-1 ${activeTab === 'stats' ? 'text-primary' : 'text-muted-foreground'}`}
          >
            <BarChart3 className="w-5 h-5" />
            <span className="text-xs">统计</span>
          </button>
        </div>
      </div>
    </div>
  )
}
