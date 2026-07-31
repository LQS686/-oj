'use client'

/**
 * 题单做题工作台（嵌入题单详情页，与作业三栏交互一致）
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDeferredEffect } from '@/hooks/useDeferredEffect'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { BookOpen } from 'lucide-react'
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
import ProblemSubmitColumn, {
  ProblemSubmitColumnHeader,
  WORKSPACE_LANGUAGE_OPTIONS,
} from '@/components/problem/ProblemSubmitColumn'
import {
  ProblemWorkspaceDesktopTabs,
  ProblemWorkspaceMobileTabs,
  ProblemWorkspaceSelectedTitle,
  WORKSPACE_PRESETS,
  type WorkspaceTab,
} from '@/components/problem/ProblemWorkspaceTabs'
import SubmissionResultModal from '@/components/submission/SubmissionResultModal'
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

const PRESET = WORKSPACE_PRESETS.training
const languageOptions = WORKSPACE_LANGUAGE_OPTIONS

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
  const [problemTab, setProblemTab] = useState<WorkspaceTab>('description')
  const [code, setCode] = useState('')
  const [language, setLanguage] = useState('cpp')
  const [submissions, setSubmissions] = useState<SubmissionListRow[]>([])
  const [submissionsLoading, setSubmissionsLoading] = useState(false)
  const [expandedSubmissionId, setExpandedSubmissionId] = useState<string | null>(null)

  const selectedMeta = railProblems[selectedIndex] ?? null
  const selectedProblemId = selectedMeta?.id ?? null

  useDeferredEffect(() => {
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

  useDeferredEffect(() => {
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

  useDeferredEffect(() => {
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
  }, [selectedProblemId, user])

  useDeferredEffect(() => {
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
        className="pb-20 lg:pb-0"
        leftSelector={
          <ProblemLetterRail
            ariaLabel="题单题目"
            problems={railProblems}
            selectedIndex={selectedIndex}
            onSelect={selectProblem}
          />
        }
        leftHeader={
          <ProblemWorkspaceDesktopTabs
            tabs={PRESET.desktopTabs}
            activeTab={problemTab}
            onChange={setProblemTab}
            layoutId="training-problem-tab-indicator"
            dense={PRESET.dense}
            leading={
              selectedMeta ? (
                <ProblemWorkspaceSelectedTitle
                  letter={selectedMeta.label}
                  title={selectedMeta.title}
                  maxWidthClass="max-w-[36%]"
                />
              ) : null
            }
          />
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
                  <ProblemDescription
                    problem={problemDetail}
                    hideTags={PRESET.hideDescriptionTags}
                  />
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
              tags={PRESET.hideDifficultyAndTags ? undefined : problemDetail.tags}
              difficulty={
                PRESET.hideDifficultyAndTags ? undefined : problemDetail.difficulty
              }
              hideDifficultyAndTags={PRESET.hideDifficultyAndTags}
            />
          ) : null
        }
        rightHeader={<ProblemSubmitColumnHeader />}
        rightPanel={
          <ProblemSubmitColumn
            user={user}
            code={code}
            language={language}
            onCodeChange={setCode}
            onLanguageChange={setLanguage}
            onSubmit={() => void handleSubmit()}
            submitting={submitting}
            problemId={selectedProblemId}
          />
        }
        bottomBar={
          <ProblemWorkspaceMobileTabs
            tabs={PRESET.mobileTabs}
            activeTab={problemTab}
            onChange={setProblemTab}
          />
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
    </>
  )
}
