'use client'

import { useState, useEffect, useMemo, useCallback, type ReactNode } from 'react'
import { useDeferredEffect } from '@/hooks/useDeferredEffect'
import { motion, AnimatePresence } from 'motion/react'
import {
  AlertCircle,
  Wifi,
  CheckCircle2,
  FileCode,
  Edit3,
} from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useUser } from '@/contexts/UserContext'
import ProblemWorkspaceShell from '@/components/problem/ProblemWorkspaceShell'
import ProblemMetaHeader from '@/components/problem/ProblemMetaHeader'
import {
  ProblemSubmitColumnHeader,
  WORKSPACE_LANGUAGE_OPTIONS,
} from '@/components/problem/ProblemSubmitColumnMeta'
import {
  ProblemWorkspaceDesktopTabs,
  ProblemWorkspaceMobileTabs,
  WORKSPACE_PRESETS,
  type WorkspaceTab,
} from '@/components/problem/ProblemWorkspaceTabs'
import SubmissionResultModal from '@/components/submission/SubmissionResultModal'
import { fetchWithCookie } from '@/lib/api/base'
import { logger } from '@/lib/logger'
import { canManageContent } from '@/lib/permissions'
import Link from 'next/link'
import { useProblemDocumentTitle } from '@/hooks/useProblemDocumentTitle'
import toast from 'react-hot-toast'
import { PageContainer } from '@/components/layout'
import { loginPathFromLocation } from '@/lib/navigation'
import {
  createPendingListRow,
  defaultMergeSubmissionList,
  useSubmissionResultFlow,
  type SubmissionListRow,
} from '@/hooks/useSubmissionResultFlow'
import type { Problem } from '@/types/models'
import dynamic from 'next/dynamic'

// 懒加载重组件：CodeMirror 编辑器、KaTeX 之外的 tab 面板按需下载，
// 减小题面首屏 JS 体积，让题面文本（ProblemDescription）优先渲染。
const ProblemSubmitColumn = dynamic(
  () => import('@/components/problem/ProblemSubmitColumn'),
  {
    ssr: false,
    loading: () => <EditorSkeleton />,
  }
)
const SubmissionList = dynamic(() => import('@/components/problem/SubmissionList'), { ssr: false })
const SolutionTabPanel = dynamic(() => import('@/components/problem/SolutionTabPanel'), { ssr: false })
const ProblemStatsPanel = dynamic(() => import('@/components/problem/ProblemStatsPanel'), { ssr: false })

function EditorSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-9 rounded-lg bg-muted animate-pulse" />
      <div className="h-[420px] rounded-lg bg-muted/70 animate-pulse" />
    </div>
  )
}

const PRESET = WORKSPACE_PRESETS.library
const languageOptions = WORKSPACE_LANGUAGE_OPTIONS

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

export default function ProblemPageClient({
  problemId,
  initialProblem,
  descriptionContent,
}: {
  problemId: string
  initialProblem: Problem
  descriptionContent: ReactNode
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useUser()
  
  const fromAssignment = searchParams.get('fromAssignment')
  const classId = searchParams.get('classId')
  const assignmentTitle = searchParams.get('assignmentTitle')
  const fromTraining = searchParams.get('from') === 'training'
  const trainingTitle = searchParams.get('trainingTitle')
  const classNameParam = searchParams.get('className')

  const isAssignmentContext = fromAssignment === '1'
  const tabParam = searchParams.get('tab')

  const [code, setCode] = useState('')
  const [language, setLanguage] = useState('cpp')
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(() => {
    if (
      tabParam === 'solutions' ||
      tabParam === 'submissions' ||
      tabParam === 'stats' ||
      tabParam === 'code' ||
      tabParam === 'description'
    ) {
      return tabParam
    }
    return 'description'
  })

  const desktopTabs = useMemo(
    () =>
      PRESET.desktopTabs.filter((tab) => !(isAssignmentContext && tab === 'solutions')),
    [isAssignmentContext]
  )

  useDeferredEffect(() => {
    if (
      tabParam === 'solutions' ||
      tabParam === 'submissions' ||
      tabParam === 'stats' ||
      tabParam === 'code' ||
      tabParam === 'description'
    ) {
      setActiveTab(tabParam)
    }
  }, [tabParam])

  const [problem] = useState<Problem | null>(initialProblem)
  const [problemLoading] = useState(false)
  const [problemError] = useState<string | null>(null)

  const [submissions, setSubmissions] = useState<SubmissionListRow[]>([])
  const [submissionsLoading, setSubmissionsLoading] = useState(false)
  const [expandedSubmissionId, setExpandedSubmissionId] = useState<string | null>(null)

  const handleLanguageChange = (value: string) => {
    setLanguage(value)
    // 仅在用户手动切换时写入本题语言草稿；偏好回退的默认语言不落草稿，
    // 否则草稿固化后修改偏好将不再生效（且切题时 effect 写回会产生竞态）
    if (typeof window === 'undefined' || !problem?.id) return
    const langKey = getLanguageStorageKey(problem.id, classId, fromAssignment)
    localStorage.setItem(langKey, value)
  }

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

  useDeferredEffect(() => {
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

  useDeferredEffect(() => {
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

  useDeferredEffect(() => {
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

  const handleSubmit = useCallback(async () => {
    if (!user) {
      router.push(loginPathFromLocation())
      return
    }

    if (!code.trim()) {
      toast.error('代码不能为空')
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
  }, [
    user,
    router,
    code,
    language,
    fromAssignment,
    classId,
    problemId,
    beginSubmitSession,
    isEpochCurrent,
    bindSubmission,
    abortSubmitSession,
  ])

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
  }, [user, code, handleSubmit, submittingRef])

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
            <CheckCircle2 className="w-4 h-4 text-secondary transition-transform duration-300" />
            <span>通过率 {acceptRate}%</span>
          </div>
          <div className="flex items-center gap-1.5 hover:text-primary-light transition-colors duration-300 group">
            <FileCode className="w-4 h-4 transition-transform duration-300" />
            <span>{problem.totalSubmit?.toLocaleString() || '0'} 提交</span>
          </div>
          {user && isConnected && (
            <div className="flex items-center gap-1.5 text-xs text-secondary hover:text-secondary-light transition-colors duration-300 group">
              <Wifi className="w-3.5 h-3.5 transition-transform duration-300" />
              <span>实时连接</span>
            </div>
          )}
        </div>

        <ProblemWorkspaceShell
          codeMode={activeTab === 'code'}
          className="pb-20 lg:pb-0"
          metaHeader={
            <ProblemMetaHeader
              timeLimit={problem.timeLimit}
              memoryLimit={problem.memoryLimit}
              tags={problem.tags}
              difficulty={problem.difficulty}
            />
          }
          leftHeader={
            <ProblemWorkspaceDesktopTabs
              tabs={desktopTabs}
              activeTab={activeTab}
              onChange={setActiveTab}
              layoutId="problem-tab-indicator"
              dense={PRESET.dense}
            />
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
                  {descriptionContent}
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
          rightHeader={<ProblemSubmitColumnHeader />}
          rightPanel={
            <ProblemSubmitColumn
              user={user}
              code={code}
              language={language}
              onCodeChange={setCode}
              onLanguageChange={handleLanguageChange}
              onSubmit={() => void handleSubmit()}
              submitting={submitting}
              problemId={problemId}
              editorHeight="420px"
            />
          }
          bottomBar={
            <ProblemWorkspaceMobileTabs
              tabs={PRESET.mobileTabs}
              activeTab={activeTab}
              onChange={setActiveTab}
            />
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
    </div>
  )
}
