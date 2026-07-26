'use client'

/**
 * 题单做题工作台（嵌入题单详情页，与作业三栏交互一致）
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertCircle,
  BookOpen,
  ListChecks,
  MessageSquare,
  FileText,
  History,
  Code as CodeIcon,
  Send,
} from 'lucide-react'
import { useUser } from '@/contexts/UserContext'
import { fetchWithCookie } from '@/lib/api/base'
import { logger } from '@/lib/logger'
import { useProblemDocumentTitle } from '@/hooks/useProblemDocumentTitle'
import ProblemDescription from '@/components/problem/ProblemDescription'
import ProblemWorkspaceShell from '@/components/problem/ProblemWorkspaceShell'
import ProblemMetaHeader from '@/components/problem/ProblemMetaHeader'
import ProblemLetterRail, {
  type ProblemLetterStatus,
} from '@/components/problem/ProblemLetterRail'
import SubmissionList from '@/components/problem/SubmissionList'
import SolutionTabPanel from '@/components/problem/SolutionTabPanel'
import PretestPanel from '@/components/problem/PretestPanel'
import SubmissionResultModal from '@/components/submission/SubmissionResultModal'
import CodeEditor, { CodeLanguage } from '@/components/code-editor/CodeEditor'
import { loginPath } from '@/lib/navigation'
import {
  createPendingListRow,
  defaultMergeSubmissionList,
  useSubmissionResultFlow,
  type SubmissionListRow,
} from '@/hooks/useSubmissionResultFlow'
import type { Problem } from '@/types/models'
import type { TrainingDetail, TrainingProblemStatus } from '@/lib/training/types'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

const languageOptions = [
  { value: 'cpp', label: 'C++', version: 'C++17' },
  { value: 'c', label: 'C', version: 'C11' },
  { value: 'python', label: 'Python', version: 'Python 3.10' },
]

function mapStatus(status: TrainingProblemStatus | string | null | undefined): ProblemLetterStatus {
  if (status === 'AC') return 'AC'
  if (status === 'Attempted' || status === 'ATTEMPTED' || status === 'WRONG') {
    return 'Attempted'
  }
  return null
}

export interface TrainingProblemWorkspaceProps {
  trainingId: string
  trainingTitle: string
  problems: TrainingDetail['problems']
  /** URL ?problem= 初始选中 */
  initialProblemId?: string | null
  onProblemChange?: (problemId: string) => void
  onProgressRefresh?: () => void
}

export default function TrainingProblemWorkspace({
  trainingId,
  trainingTitle,
  problems,
  initialProblemId,
  onProblemChange,
  onProgressRefresh,
}: TrainingProblemWorkspaceProps) {
  const router = useRouter()
  const { user } = useUser()

  const railProblems = useMemo(
    () =>
      problems.map((item, idx) => {
        const id = item.problem?.id || ''
        const letter = LETTERS[item.orderIndex] || LETTERS[idx] || String(idx + 1)
        return {
          id,
          label: letter,
          title: item.problem?.title || '题目',
          status: mapStatus(item.status),
          subtitle: item.required ? '必做' : undefined,
        }
      }).filter((p) => p.id),
    [problems]
  )

  const [selectedIndex, setSelectedIndex] = useState(0)
  const [problemDetail, setProblemDetail] = useState<Problem | null>(null)
  const [problemLoading, setProblemLoading] = useState(false)
  const [problemTab, setProblemTab] = useState<
    'description' | 'solutions' | 'submissions' | 'code'
  >('description')
  const [code, setCode] = useState('')
  const [language, setLanguage] = useState('cpp')
  const [submissions, setSubmissions] = useState<SubmissionListRow[]>([])
  const [submissionsLoading, setSubmissionsLoading] = useState(false)
  const [expandedSubmissionId, setExpandedSubmissionId] = useState<string | null>(null)

  const selectedMeta = railProblems[selectedIndex] ?? null
  const selectedProblemId = selectedMeta?.id ?? null

  useEffect(() => {
    if (!initialProblemId || railProblems.length === 0) return
    const idx = railProblems.findIndex((p) => p.id === initialProblemId)
    if (idx >= 0) setSelectedIndex(idx)
  }, [initialProblemId, railProblems])

  const selectProblem = useCallback(
    (index: number) => {
      if (index < 0 || index >= railProblems.length) return
      setSelectedIndex(index)
      setExpandedSubmissionId(null)
      setProblemTab('description')
      const id = railProblems[index]?.id
      if (id) onProblemChange?.(id)
    },
    [railProblems, onProblemChange]
  )

  useEffect(() => {
    if (!selectedProblemId) {
      setProblemDetail(null)
      return
    }
    let cancelled = false
    async function loadDetail() {
      try {
        setProblemLoading(true)
        const res = await fetchWithCookie(`/api/problems/${selectedProblemId}`)
        const data = await res.json()
        if (cancelled) return
        setProblemDetail(data.success ? data.data : null)
      } catch {
        if (!cancelled) setProblemDetail(null)
      } finally {
        if (!cancelled) setProblemLoading(false)
      }
    }
    void loadDetail()
    return () => {
      cancelled = true
    }
  }, [selectedProblemId])

  const titleContext = useMemo(
    () => ({
      kind: 'training' as const,
      label: selectedMeta?.label || LETTERS[selectedIndex] || 'A',
      trainingTitle: trainingTitle || undefined,
    }),
    [selectedMeta?.label, selectedIndex, trainingTitle]
  )
  useProblemDocumentTitle(problemDetail?.title, titleContext)

  useEffect(() => {
    if (typeof window === 'undefined' || !problemDetail?.id) return
    const codeKey = `code_training_${trainingId}_${problemDetail.id}`
    setCode(localStorage.getItem(codeKey) ?? '')
    const langKey = `lang_training_${trainingId}_${problemDetail.id}`
    const savedLang = localStorage.getItem(langKey)
    if (savedLang && languageOptions.some((l) => l.value === savedLang)) {
      setLanguage(savedLang)
      return
    }
    let fallback = 'cpp'
    try {
      const prefsRaw = localStorage.getItem('dsoj_default_code_language')
      if (prefsRaw && languageOptions.some((l) => l.value === prefsRaw)) {
        fallback = prefsRaw
      }
    } catch {
      /* ignore */
    }
    setLanguage(fallback)
  }, [problemDetail?.id, trainingId])

  useEffect(() => {
    if (typeof window === 'undefined' || !problemDetail?.id) return
    localStorage.setItem(`code_training_${trainingId}_${problemDetail.id}`, code)
  }, [code, problemDetail?.id, trainingId])

  useEffect(() => {
    if (typeof window === 'undefined' || !problemDetail?.id) return
    localStorage.setItem(`lang_training_${trainingId}_${problemDetail.id}`, language)
  }, [language, problemDetail?.id, trainingId])

  const fetchSubmissions = useCallback(async () => {
    if (!selectedProblemId) return
    try {
      setSubmissionsLoading(true)
      const url = user
        ? `/api/problems/${selectedProblemId}/submissions?userId=${user.id}`
        : `/api/problems/${selectedProblemId}/submissions`
      const res = await fetchWithCookie(url, { cache: 'no-store' })
      const data = await res.json()
      setSubmissions(data.success ? data.data.submissions || [] : [])
    } catch (err) {
      logger.error('Fetch training submissions failed', err)
      setSubmissions([])
    } finally {
      setSubmissionsLoading(false)
    }
  }, [selectedProblemId, user?.id])

  useEffect(() => {
    if (problemTab === 'submissions') void fetchSubmissions()
  }, [problemTab, fetchSubmissions])

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1024 && problemTab === 'code') {
        setProblemTab('description')
      }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [problemTab])

  const {
    submitting,
    showResultModal,
    lastResult,
    judgeProgress,
    beginSubmitSession,
    bindSubmission,
    abortSubmitSession,
    isEpochCurrent,
    closeResultModal,
  } = useSubmissionResultFlow({
    userId: user?.id,
    enabled: !!user,
    openModalOnSubmit: true,
    submissions,
    setSubmissions,
    onRefreshAfterFinal: () => {
      void fetchSubmissions()
      onProgressRefresh?.()
    },
    mergeListOnUpdate: (prev, data) =>
      defaultMergeSubmissionList(prev, data, { language }),
  })

  const handleSubmit = async () => {
    if (!user) {
      router.push(
        loginPath(
          `/training/${trainingId}?tab=problems${selectedProblemId ? `&problem=${selectedProblemId}` : ''}`
        )
      )
      return
    }
    if (!selectedProblemId || !code.trim()) return

    const epoch = beginSubmitSession()
    if (epoch < 0) return
    try {
      const res = await fetchWithCookie('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problemId: selectedProblemId, code, language }),
      })
      const data = await res.json()
      if (!isEpochCurrent(epoch)) return
      if (!data.success) {
        abortSubmitSession()
        return
      }
      const submissionId = data.data?.submissionId as string | undefined
      if (!submissionId || !bindSubmission(epoch, submissionId)) return
      setProblemTab('submissions')
      setExpandedSubmissionId(submissionId)
      setSubmissions((prev) => {
        const list = Array.isArray(prev) ? prev : []
        if (list.some((s) => s?.id === submissionId)) return list
        return [createPendingListRow({ id: submissionId, language, code }), ...list]
      })
    } catch {
      abortSubmitSession()
    }
  }

  if (railProblems.length === 0) {
    return (
      <div className="card-static rounded-xl p-12 text-center text-sm text-muted-foreground">
        <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-40" />
        该题单暂无题目
      </div>
    )
  }

  return (
    <>
      <ProblemWorkspaceShell
        dense
        codeMode={problemTab === 'code'}
        leftSelector={
          <ProblemLetterRail
            ariaLabel="题单题目"
            problems={railProblems}
            selectedIndex={selectedIndex}
            onSelect={selectProblem}
          />
        }
        leftHeader={
          <>
            {selectedMeta && (
              <div className="hidden lg:flex items-center gap-2 px-4 py-2.5 border-r border-border min-w-0 max-w-[36%] shrink">
                <span className="shrink-0 w-6 h-6 rounded-md bg-primary/10 text-primary-light font-mono text-xs font-bold flex items-center justify-center">
                  {selectedMeta.label}
                </span>
                <span className="truncate text-sm font-medium" title={selectedMeta.title}>
                  {selectedMeta.title}
                </span>
              </div>
            )}
            {(
              [
                { key: 'description' as const, label: '题目描述', icon: BookOpen },
                { key: 'solutions' as const, label: '题解', icon: MessageSquare },
                { key: 'submissions' as const, label: '提交记录', icon: ListChecks },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon
              const isActive = problemTab === tab.key
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setProblemTab(tab.key)}
                  className={`flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium transition-all duration-300 relative cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'text-primary-light'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="training-problem-tab-indicator"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full"
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    />
                  )}
                  <Icon
                    className={`w-3.5 h-3.5 transition-transform duration-300 ${isActive ? 'rotate-3' : ''}`}
                  />
                  {tab.label}
                </button>
              )
            })}
          </>
        }
        leftPanel={
          <AnimatePresence mode="wait">
            {problemTab === 'description' && (
              <motion.div
                key="description"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
              >
                {problemLoading ? (
                  <div className="p-10 text-center">
                    <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3" />
                    <span className="text-sm text-muted-foreground">加载题目内容...</span>
                  </div>
                ) : problemDetail ? (
                  <ProblemDescription problem={problemDetail} hideTags />
                ) : (
                  <div className="p-10 text-center text-sm text-muted-foreground">
                    题目内容加载失败
                  </div>
                )}
              </motion.div>
            )}
            {problemTab === 'solutions' && selectedProblemId && (
              <motion.div
                key="solutions"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
              >
                <SolutionTabPanel problemId={selectedProblemId} isAssignmentContext={false} />
              </motion.div>
            )}
            {problemTab === 'submissions' && (
              <motion.div
                key="submissions"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
              >
                <SubmissionList
                  submissions={submissions}
                  loading={submissionsLoading}
                  error={null}
                  user={user}
                  expandedId={expandedSubmissionId}
                  onExpandedChange={setExpandedSubmissionId}
                />
              </motion.div>
            )}
          </AnimatePresence>
        }
        metaHeader={
          problemDetail ? (
            <ProblemMetaHeader
              timeLimit={problemDetail.timeLimit}
              memoryLimit={problemDetail.memoryLimit}
              tags={problemDetail.tags}
              difficulty={problemDetail.difficulty}
            />
          ) : null
        }
        rightHeader={
          <>
            <CodeIcon className="w-4 h-4 text-primary-light" />
            <h3 className="text-sm font-medium text-foreground">提交代码</h3>
          </>
        }
        rightPanel={
          <>
            {!user && (
              <div className="p-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-accent text-xs flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                请先登录后再提交代码
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <label className="text-xs font-medium text-foreground whitespace-nowrap">语言</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="px-2.5 py-1 rounded-md border border-border bg-background text-xs focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
              >
                {languageOptions.map((lang) => (
                  <option key={lang.value} value={lang.value}>
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
              height="min(28rem, calc(100vh - 22rem))"
              maxLength={65536}
              onSubmit={() => void handleSubmit()}
            />
            <div className="flex items-center gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={submitting || !user || !code.trim()}
                title={!user ? '请先登录' : submitting ? '正在评测中...' : ''}
                className="btn-primary btn flex-1 max-w-xs h-9 text-sm"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    评测中...
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
                type="button"
                onClick={() => setCode('')}
                className="btn-ghost btn cursor-pointer h-9 text-sm"
              >
                清空
              </button>
            </div>
            {selectedProblemId && (
              <PretestPanel
                problemId={selectedProblemId}
                code={code}
                language={language}
                disabled={!user || submitting}
              />
            )}
          </>
        }
      />

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
          setProblemTab('submissions')
          setExpandedSubmissionId(submissionId)
        }}
      />

      <div className="fixed bottom-0 left-0 right-0 bg-background-secondary border-t border-border z-40 lg:hidden">
        <div className="grid grid-cols-4">
          <button
            type="button"
            onClick={() => setProblemTab('description')}
            className={`flex flex-col items-center justify-center py-3 gap-1 ${
              problemTab === 'description' ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <FileText className="w-5 h-5" />
            <span className="text-xs">题面</span>
          </button>
          <button
            type="button"
            onClick={() => setProblemTab('code')}
            className={`flex flex-col items-center justify-center py-3 gap-1 ${
              problemTab === 'code' ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <CodeIcon className="w-5 h-5" />
            <span className="text-xs">代码</span>
          </button>
          <button
            type="button"
            onClick={() => setProblemTab('submissions')}
            className={`flex flex-col items-center justify-center py-3 gap-1 ${
              problemTab === 'submissions' ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <History className="w-5 h-5" />
            <span className="text-xs">提交</span>
          </button>
          <button
            type="button"
            onClick={() => setProblemTab('solutions')}
            className={`flex flex-col items-center justify-center py-3 gap-1 ${
              problemTab === 'solutions' ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <MessageSquare className="w-5 h-5" />
            <span className="text-xs">题解</span>
          </button>
        </div>
      </div>
    </>
  )
}
