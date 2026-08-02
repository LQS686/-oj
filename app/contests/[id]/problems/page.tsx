'use client'

import { useCallback, useEffect, useMemo, useState, Suspense } from 'react'
import { useDeferredEffect } from '@/hooks/useDeferredEffect'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { AnimatePresence, motion } from 'motion/react'
import { useUser } from '@/contexts/UserContext'
import { fetchWithCookie } from '@/lib/api/base'
import { logger } from '@/lib/logger'
import { useProblemDocumentTitle } from '@/hooks/useProblemDocumentTitle'
import ProblemDescription from '@/components/problem/ProblemDescription'
import ProblemWorkspaceShell from '@/components/problem/ProblemWorkspaceShell'
import ProblemMetaHeader from '@/components/problem/ProblemMetaHeader'
import ProblemLetterRail from '@/components/problem/ProblemLetterRail'
import SubmissionList from '@/components/problem/SubmissionList'
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
import { RouteSuspenseFallback } from '@/components/common'
import { AlertCircle } from 'lucide-react'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const PRESET = WORKSPACE_PRESETS.contest
const languageOptions = WORKSPACE_LANGUAGE_OPTIONS

interface ContestProblemRow {
  id: string
  orderIndex: number
  label: string
  title: string
  status: 'AC' | 'Attempted' | null
}

function ContestProblemsWorkspace() {
  const params = useParams()
  const contestId = params.id as string
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useUser()

  const [contestProblems, setContestProblems] = useState<ContestProblemRow[]>([])
  const [contestTitle, setContestTitle] = useState('')
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [problemDetail, setProblemDetail] = useState<Problem | null>(null)
  const [problemLoading, setProblemLoading] = useState(false)
  const [problemTab, setProblemTab] = useState<WorkspaceTab>('description')
  const [code, setCode] = useState('')
  const [language, setLanguage] = useState('cpp')
  const [submissions, setSubmissions] = useState<SubmissionListRow[]>([])
  const [submissionsLoading, setSubmissionsLoading] = useState(false)
  const [expandedSubmissionId, setExpandedSubmissionId] = useState<string | null>(null)

  const selectedProblem = contestProblems[selectedIndex] ?? null
  const selectedProblemId = selectedProblem?.id ?? null

  const refreshContestProblems = useCallback(async () => {
    try {
      const res = await fetchWithCookie(`/api/contests/${contestId}/problems`, {
        cache: 'no-store',
      })
      const data = await res.json()
      if (data.success && Array.isArray(data.data)) {
        setContestProblems(data.data)
      }
    } catch {
      /* ignore */
    }
  }, [contestId])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setListLoading(true)
        setListError('')
        const [pRes, cRes] = await Promise.all([
          fetchWithCookie(`/api/contests/${contestId}/problems`, { cache: 'no-store' }),
          fetchWithCookie(`/api/contests/${contestId}`),
        ])
        const pData = await pRes.json()
        const cData = await cRes.json()
        if (cancelled) return
        if (!pData.success) {
          setListError(pData.error || '加载题目失败')
          setContestProblems([])
          return
        }
        const list: ContestProblemRow[] = pData.data || []
        setContestProblems(list)
        if (cData.success && cData.data?.title) setContestTitle(cData.data.title)

        const q = searchParams.get('problem')
        const idx = q ? list.findIndex((p) => p.id === q) : 0
        setSelectedIndex(idx >= 0 ? idx : 0)
      } catch {
        if (!cancelled) setListError('网络错误')
      } finally {
        if (!cancelled) setListLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
    // 仅 contestId 初载；problem query 在下方 sync
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contestId])

  useDeferredEffect(() => {
    if (contestProblems.length === 0) return
    const q = searchParams.get('problem')
    if (!q) return
    const idx = contestProblems.findIndex((p) => p.id === q)
    if (idx >= 0 && idx !== selectedIndex) setSelectedIndex(idx)
  }, [searchParams, contestProblems, selectedIndex])

  const selectProblem = useCallback(
    (index: number) => {
      if (index < 0 || index >= contestProblems.length) return
      setSelectedIndex(index)
      setExpandedSubmissionId(null)
      setProblemTab('description')
      const id = contestProblems[index]?.id
      if (id) {
        router.replace(`/contests/${contestId}/problems?problem=${encodeURIComponent(id)}`, {
          scroll: false,
        })
      }
    },
    [contestProblems, contestId, router]
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
        const res = await fetchWithCookie(
          `/api/problems/${selectedProblemId}?contestId=${encodeURIComponent(contestId)}`
        )
        const data = await res.json()
        if (cancelled) return
        if (data.success) setProblemDetail(data.data)
        else setProblemDetail(null)
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
  }, [selectedProblemId, contestId])

  const titleContext = useMemo(
    () => ({
      kind: 'contest' as const,
      label: selectedProblem?.label || LETTERS[selectedIndex] || 'A',
      contestTitle: contestTitle || undefined,
    }),
    [selectedProblem?.label, selectedIndex, contestTitle]
  )
  useProblemDocumentTitle(problemDetail?.title, titleContext)

  useDeferredEffect(() => {
    if (typeof window === 'undefined' || !problemDetail?.id) return
    const codeKey = `code_contest_${contestId}_${problemDetail.id}`
    const savedCode = localStorage.getItem(codeKey)
    setCode(savedCode ?? '')
    const langKey = `lang_contest_${contestId}_${problemDetail.id}`
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
  }, [problemDetail?.id, contestId])

  useEffect(() => {
    if (typeof window === 'undefined' || !problemDetail?.id) return
    localStorage.setItem(`code_contest_${contestId}_${problemDetail.id}`, code)
  }, [code, problemDetail?.id, contestId])

  useEffect(() => {
    if (typeof window === 'undefined' || !problemDetail?.id) return
    localStorage.setItem(`lang_contest_${contestId}_${problemDetail.id}`, language)
  }, [language, problemDetail?.id, contestId])

  const fetchSubmissions = useCallback(async () => {
    if (!selectedProblemId) return
    try {
      setSubmissionsLoading(true)
      const res = await fetchWithCookie(
        `/api/contests/${contestId}/submissions?problemId=${selectedProblemId}&userId=${user?.id || ''}`,
        { cache: 'no-store' }
      )
      const data = await res.json()
      setSubmissions(data.success ? data.data.submissions || [] : [])
    } catch (err) {
      logger.error('Fetch contest submissions failed', err)
      setSubmissions([])
    } finally {
      setSubmissionsLoading(false)
    }
  }, [contestId, selectedProblemId, user])

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
      void refreshContestProblems()
    },
    mergeListOnUpdate: (prev, data) =>
      defaultMergeSubmissionList(prev, data, { language }),
  })

  const handleSubmit = async () => {
    if (!user) {
      router.push(
        loginPath(
          `/contests/${contestId}/problems${selectedProblemId ? `?problem=${selectedProblemId}` : ''}`
        )
      )
      return
    }
    if (!selectedProblemId || !code.trim()) return

    const epoch = beginSubmitSession()
    if (epoch < 0) return
    try {
      const res = await fetchWithCookie(`/api/contests/${contestId}/submissions`, {
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
        return [
          createPendingListRow({
            id: submissionId,
            language,
            code,
            extras: { problemId: selectedProblemId, userId: user.id },
          }),
          ...list,
        ]
      })
    } catch {
      abortSubmitSession()
    }
  }

  if (listLoading) {
    return (
      <div className="card-static rounded-xl p-10 flex justify-center">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  if (listError) {
    return (
      <div className="card-static rounded-xl p-12 text-center">
        <AlertCircle className="w-8 h-8 text-error mx-auto mb-4" />
        <p className="text-foreground font-medium mb-2">{listError}</p>
        <p className="text-muted-foreground text-sm mb-6">
          可能原因：竞赛未开始、未报名或无权访问
        </p>
        <button
          type="button"
          onClick={() => router.push(`/contests/${contestId}`)}
          className="btn btn-primary"
        >
          返回概览
        </button>
      </div>
    )
  }

  if (contestProblems.length === 0) {
    return (
      <div className="card-static rounded-xl p-12 text-center text-muted-foreground text-sm">
        暂无题目
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
            ariaLabel="竞赛题目"
            problems={contestProblems.map((p) => ({
              id: p.id,
              label: p.label,
              title: p.title,
              status: p.status,
            }))}
            selectedIndex={selectedIndex}
            onSelect={selectProblem}
          />
        }
        leftHeader={
          <ProblemWorkspaceDesktopTabs
            tabs={PRESET.desktopTabs}
            activeTab={problemTab}
            onChange={setProblemTab}
            layoutId="contest-problem-tab-indicator"
            dense={PRESET.dense}
            leading={
              selectedProblem ? (
                <ProblemWorkspaceSelectedTitle
                  letter={selectedProblem.label || LETTERS[selectedIndex]}
                  title={selectedProblem.title}
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
            contestId={contestId}
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

export default function ContestProblemsPage() {
  return (
    <Suspense fallback={<RouteSuspenseFallback label="加载题目..." />}>
      <ContestProblemsWorkspace />
    </Suspense>
  )
}
