'use client'

import { useState, useEffect, use, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpen,
  Send,
  AlertCircle,
  Wifi,
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
import { useRouter, useSearchParams } from 'next/navigation'
import { useUser } from '@/contexts/UserContext'
import ProblemDescription from '@/components/problem/ProblemDescription'
import ProblemWorkspaceShell from '@/components/problem/ProblemWorkspaceShell'
import ProblemMetaHeader from '@/components/problem/ProblemMetaHeader'
import SubmissionList from '@/components/problem/SubmissionList'
import SolutionTabPanel from '@/components/problem/SolutionTabPanel'
import ProblemStatsPanel from '@/components/problem/ProblemStatsPanel'
import PretestPanel from '@/components/problem/PretestPanel'
import SubmissionResultModal from '@/components/submission/SubmissionResultModal'
import { fetchWithCookie } from '@/lib/api/base'
import { logger } from '@/lib/logger'
import { canManageContent } from '@/lib/permissions'
import Link from 'next/link'
import { useProblemDocumentTitle } from '@/hooks/useProblemDocumentTitle'
import toast from 'react-hot-toast'
import CodeEditor, { CodeLanguage } from '@/components/code-editor/CodeEditor'
import { PageContainer } from '@/components/layout'
import { loginPathFromLocation } from '@/lib/navigation'
import {
  createPendingListRow,
  defaultMergeSubmissionList,
  useSubmissionResultFlow,
  type SubmissionListRow,
} from '@/hooks/useSubmissionResultFlow'

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

  const [problem, setProblem] = useState<any>(null)
  const [problemLoading, setProblemLoading] = useState(true)
  const [problemError, setProblemError] = useState<string | null>(null)

  const [submissions, setSubmissions] = useState<SubmissionListRow[]>([])
  const [submissionsLoading, setSubmissionsLoading] = useState(false)
  const [expandedSubmissionId, setExpandedSubmissionId] = useState<string | null>(null)

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
      return
    }
    // 无本题语言草稿时，回退到用户偏好中的默认语言
    let fallback = 'cpp'
    try {
      const prefsRaw = localStorage.getItem('dsoj_default_code_language')
      if (prefsRaw && languageOptions.some((l) => l.value === prefsRaw)) {
        fallback = prefsRaw
      }
    } catch {
      // ignore
    }
    setLanguage(fallback)
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

  const {
    submitting,
    lastResult,
    showResultModal,
    judgeProgress,
    isConnected,
    submittingRef,
    beginSubmitSession,
    bindSubmission,
    abortSubmitSession,
    closeResultModal,
    isEpochCurrent,
  } = useSubmissionResultFlow({
    userId: user?.id,
    enabled: !!user,
    submissions,
    setSubmissions,
    onRefreshAfterFinal: () => {
      void fetchSubmissions()
    },
    mergeListOnUpdate: (prev, data) =>
      defaultMergeSubmissionList(prev, data, { language }),
  })

  const handleSubmit = async () => {
    if (!user) {
      router.push(loginPathFromLocation())
      return
    }

    if (!code.trim() || code.trim().length < 10) {
      toast.error('代码不能为空或少于10个字符')
      return
    }

    const epoch = beginSubmitSession()
    if (epoch < 0) return

    try {
      let submitUrl: string
      let submitBody: Record<string, string>

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

      if (!isEpochCurrent(epoch)) return

      if (data.success) {
        const payload = data.data
        const submissionId = payload?.submissionId
        if (!submissionId || !bindSubmission(epoch, submissionId)) return
        setActiveTab('submissions')
        setExpandedSubmissionId(submissionId)
        setSubmissions((prev) => {
          const list = Array.isArray(prev) ? prev : []
          if (list.some((s) => s?.id === submissionId)) return list
          return [
            createPendingListRow({
              id: submissionId,
              language,
              code,
              extras: {
                problemId,
                userId: user?.id,
                assignmentSubmissionId: payload.assignmentSubmissionId,
              },
            }),
            ...list,
          ]
        })
      } else {
        abortSubmitSession()
        toast.error(data.error || '提交失败')
      }
    } catch {
      abortSubmitSession()
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
      <PageContainer variant="workspace" className="pt-4 pb-6">
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
                    submissions={submissions as import('@/components/problem/SubmissionList').SubmissionListItem[]}
                    loading={submissionsLoading}
                    error={null}
                    user={user}
                    expandedId={expandedSubmissionId}
                    onExpandedChange={setExpandedSubmissionId}
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

      <SubmissionResultModal
        isOpen={showResultModal}
        onClose={closeResultModal}
        isJudging={submitting}
        judgeProgress={judgeProgress}
        result={lastResult}
        onContinueSubmit={() => {
          const cmContent = document.querySelector(
            '[data-testid="code-editor-wrapper"] .cm-content'
          ) as HTMLElement | null
          cmContent?.focus()
          closeResultModal()
        }}
        onViewDetail={(submissionId) => {
          closeResultModal()
          setActiveTab('submissions')
          setExpandedSubmissionId(submissionId)
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
