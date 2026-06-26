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

export interface TrainingProblemItem {
  id: string
  orderIndex: number
  label: string
  title: string
  problemNumber: string | null
  difficulty: string
  status: 'Accepted' | 'Attempted' | null
}

export interface TrainingMeta {
  id: string
  title: string
}

interface TrainingProblemWorkspaceValue {
  trainingId: string
  training: TrainingMeta
  trainingProblems: TrainingProblemItem[]
  trainingTitle: string
  refreshTrainingProblems: () => Promise<void>
  code: string
  setCode: (v: string) => void
  language: string
  setLanguage: (v: string) => void
  submitting: boolean
  setSubmitting: (v: boolean) => void
  submitResult: { type: 'success' | 'error'; text: string; id?: string } | null
  setSubmitResult: (v: TrainingProblemWorkspaceValue['submitResult']) => void
  judgeStatus: JudgeStatusData | null
  setJudgeStatus: (v: JudgeStatusData | null) => void
  showJudgeStatus: boolean
  setShowJudgeStatus: (v: boolean) => void
  judgeProgress: { currentTest: number; totalTests: number } | null
  setJudgeProgress: (v: TrainingProblemWorkspaceValue['judgeProgress']) => void
  lastResult: { status: string; score: number } | null
  setLastResult: (v: TrainingProblemWorkspaceValue['lastResult']) => void
  currentSubmissionId: string | null
  setCurrentSubmissionId: (v: string | null) => void
  activeTab: 'description' | 'solutions' | 'submissions'
  setActiveTab: (t: TrainingProblemWorkspaceValue['activeTab']) => void
  submissions: Submission[]
  setSubmissions: React.Dispatch<React.SetStateAction<Submission[]>>
  submissionsLoading: boolean
  setSubmissionsLoading: (v: boolean) => void
  registerSubmitHandler: (fn: () => void) => void
  submitCode: () => void
}

const TrainingProblemWorkspaceContext = createContext<TrainingProblemWorkspaceValue | null>(null)

export function TrainingProblemWorkspaceProvider({
  trainingId,
  training,
  initialProblems,
  children,
}: {
  trainingId: string
  training: TrainingMeta
  initialProblems: TrainingProblemItem[]
  children: ReactNode
}) {
  const [trainingProblems, setTrainingProblems] = useState(initialProblems)
  const [code, setCode] = useState('')
  const [language, setLanguage] = useState('cpp')
  const [submitting, setSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState<TrainingProblemWorkspaceValue['submitResult']>(null)
  const [judgeStatus, setJudgeStatus] = useState<JudgeStatusData | null>(null)
  const [showJudgeStatus, setShowJudgeStatus] = useState(false)
  const [judgeProgress, setJudgeProgress] = useState<TrainingProblemWorkspaceValue['judgeProgress']>(null)
  const [lastResult, setLastResult] = useState<TrainingProblemWorkspaceValue['lastResult']>(null)
  const [currentSubmissionId, setCurrentSubmissionId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'description' | 'solutions' | 'submissions'>('description')
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [submissionsLoading, setSubmissionsLoading] = useState(false)

  const submitHandlerRef = useRef<(() => void) | null>(null)

  const registerSubmitHandler = useCallback((fn: () => void) => {
    submitHandlerRef.current = fn
  }, [])

  const submitCode = useCallback(() => {
    submitHandlerRef.current?.()
  }, [])

  const refreshTrainingProblems = useCallback(async () => {
    try {
      const res = await fetch(`/api/trainings/${trainingId}/problem-list`, { cache: 'no-store' })
      const data = await res.json()
      if (data.success && Array.isArray(data.data?.problems)) {
        setTrainingProblems(data.data.problems)
      }
    } catch {
      /* ignore */
    }
  }, [trainingId])

  const trainingTitle = training.title

  const value = useMemo(
    () => ({
      trainingId,
      training,
      trainingProblems,
      trainingTitle,
      refreshTrainingProblems,
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
      trainingId,
      training,
      trainingProblems,
      trainingTitle,
      refreshTrainingProblems,
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
    <TrainingProblemWorkspaceContext.Provider value={value}>
      {children}
    </TrainingProblemWorkspaceContext.Provider>
  )
}

export function useTrainingProblemWorkspace() {
  const ctx = useContext(TrainingProblemWorkspaceContext)
  if (!ctx) {
    throw new Error('useTrainingProblemWorkspace must be used within TrainingProblemWorkspaceProvider')
  }
  return ctx
}