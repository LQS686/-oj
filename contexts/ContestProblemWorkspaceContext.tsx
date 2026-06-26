'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Submission, JudgeStatusData } from '@/types/models'

export interface ContestProblemItem {
  id: string
  orderIndex: number
  label: string
  title: string
  problemNumber: string | null
  difficulty: string
  status: 'Accepted' | 'Attempted' | null
}

export interface ContestMeta {
  id: string
  title: string
  startTime: string
  endTime: string
  type: string
}

interface ContestProblemWorkspaceValue {
  contestId: string
  contest: ContestMeta
  contestProblems: ContestProblemItem[]
  contestTitle: string
  refreshContestProblems: () => Promise<void>
  code: string
  setCode: (v: string) => void
  language: string
  setLanguage: (v: string) => void
  submitting: boolean
  setSubmitting: (v: boolean) => void
  submitResult: { type: 'success' | 'error'; text: string; id?: string } | null
  setSubmitResult: (v: ContestProblemWorkspaceValue['submitResult']) => void
  judgeStatus: JudgeStatusData | null
  setJudgeStatus: (v: JudgeStatusData | null) => void
  showJudgeStatus: boolean
  setShowJudgeStatus: (v: boolean) => void
  judgeProgress: { currentTest: number; totalTests: number } | null
  setJudgeProgress: (v: ContestProblemWorkspaceValue['judgeProgress']) => void
  lastResult: { status: string; score: number } | null
  setLastResult: (v: ContestProblemWorkspaceValue['lastResult']) => void
  currentSubmissionId: string | null
  setCurrentSubmissionId: (v: string | null) => void
  activeTab: 'description' | 'submissions'
  setActiveTab: (t: 'description' | 'submissions') => void
  submissions: Submission[]
  setSubmissions: React.Dispatch<React.SetStateAction<Submission[]>>
  submissionsLoading: boolean
  setSubmissionsLoading: (v: boolean) => void
  registerSubmitHandler: (fn: () => void) => void
  submitCode: () => void
}

const ContestProblemWorkspaceContext = createContext<ContestProblemWorkspaceValue | null>(null)

export function ContestProblemWorkspaceProvider({
  contestId,
  contest,
  initialProblems,
  children,
}: {
  contestId: string
  contest: ContestMeta
  initialProblems: ContestProblemItem[]
  children: ReactNode
}) {
  const [contestProblems, setContestProblems] = useState(initialProblems)
  const [code, setCode] = useState('')
  const [language, setLanguage] = useState('cpp')
  const [submitting, setSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState<ContestProblemWorkspaceValue['submitResult']>(null)
  const [judgeStatus, setJudgeStatus] = useState<JudgeStatusData | null>(null)
  const [showJudgeStatus, setShowJudgeStatus] = useState(false)
  const [judgeProgress, setJudgeProgress] = useState<ContestProblemWorkspaceValue['judgeProgress']>(null)
  const [lastResult, setLastResult] = useState<ContestProblemWorkspaceValue['lastResult']>(null)
  const [currentSubmissionId, setCurrentSubmissionId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'description' | 'submissions'>('description')
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [submissionsLoading, setSubmissionsLoading] = useState(false)

  const submitHandlerRef = useRef<(() => void) | null>(null)

  const registerSubmitHandler = useCallback((fn: () => void) => {
    submitHandlerRef.current = fn
  }, [])

  const submitCode = useCallback(() => {
    submitHandlerRef.current?.()
  }, [])

  const refreshContestProblems = useCallback(async () => {
    try {
      const res = await fetch(`/api/contests/${contestId}/problems`, { cache: 'no-store' })
      const data = await res.json()
      if (data.success && Array.isArray(data.data)) {
        setContestProblems(data.data)
      }
    } catch {
      /* ignore */
    }
  }, [contestId])

  const contestTitle = contest.title

  const value = useMemo(
    () => ({
      contestId,
      contest,
      contestProblems,
      contestTitle,
      refreshContestProblems,
      code,
      setCode,
      language,
      setLanguage,
      submitting,
      setSubmitting,
      submitResult,
      setSubmitResult,
      judgeStatus,
      setJudgeStatus,
      showJudgeStatus,
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
      registerSubmitHandler,
      submitCode,
    }),
    [
      contestId,
      contest,
      contestProblems,
      contestTitle,
      refreshContestProblems,
      code,
      language,
      submitting,
      submitResult,
      judgeStatus,
      showJudgeStatus,
      judgeProgress,
      lastResult,
      currentSubmissionId,
      activeTab,
      submissions,
      submissionsLoading,
      registerSubmitHandler,
      submitCode,
    ]
  )

  return (
    <ContestProblemWorkspaceContext.Provider value={value}>
      {children}
    </ContestProblemWorkspaceContext.Provider>
  )
}

export function useContestProblemWorkspace() {
  const ctx = useContext(ContestProblemWorkspaceContext)
  if (!ctx) {
    throw new Error('useContestProblemWorkspace must be used within ContestProblemWorkspaceProvider')
  }
  return ctx
}