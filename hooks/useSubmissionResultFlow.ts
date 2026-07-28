'use client'

/**
 * 题目 / 作业 / 题单 共用的「提交 → 评测弹窗 → WS 收结果」流程。
 *
 * 约定：列表行 id、bindSubmission、WS payload.id 一律为主 Submission.id。
 * 结果以 WebSocket 为准；仅在断线重连并确认入房后，对「当前进行中」提交补一次权威状态
 * （补上断连窗口内已发出的事件，不是周期性轮询兜底）。
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { fetchWithCookie } from '@/lib/api/base'
import {
  SubmissionStatus,
  isFinalSubmissionStatus,
  isNonFinalSubmissionStatus,
} from '@/lib/constants/submission-status'
import { useSubmissionSocket } from '@/hooks/useSubmissionSocket'
import type { SubmissionResultData } from '@/components/submission/SubmissionResultModal'

/** 页面提交列表行；id 必须是主 Submission.id */
export type SubmissionListRow = {
  id: string
  status: string
  submittedAt: string
  score?: number
  time?: number
  memory?: number
  passedTests?: number
  totalTests?: number
  message?: string | null
  language?: string
  code?: string
  userId?: string
  problemId?: string
  testResults?: SubmissionResultData['testResults']
  /** 作业记录 id（元数据）；列表主键仍是主 Submission.id */
  assignmentSubmissionId?: string
  timeElapsedMs?: number
  isLate?: boolean
}

export type SubmissionSocketPayload = {
  id: string
  status: string
  score?: number
  time?: number
  memory?: number
  passedTests?: number
  totalTests?: number
  message?: string | null
  testResults?: SubmissionResultData['testResults']
  timeElapsedMs?: number
  language?: string
  assignmentSubmissionId?: string
}

type Options<T extends SubmissionListRow = SubmissionListRow> = {
  userId?: string
  enabled?: boolean
  /** 为 false 时 beginSubmitSession 不自动打开结果弹窗（竞赛页用侧栏反馈） */
  openModalOnSubmit?: boolean
  submissions: T[]
  /** 终态后刷新列表等 */
  onRefreshAfterFinal?: () => void
  /** 终态写入弹窗后的副作用（如作业清空代码） */
  onFinalApplied?: (result: SubmissionResultData) => void
  /** WS 更新时合并列表；返回 null 表示不改列表 */
  mergeListOnUpdate?: (prev: T[], data: SubmissionSocketPayload) => T[] | null
  setSubmissions?: Dispatch<SetStateAction<T[]>>
}

function payloadToResult(data: SubmissionSocketPayload): SubmissionResultData {
  return {
    submissionId: data.id,
    status: data.status,
    score: typeof data.score === 'number' ? data.score : 0,
    time: typeof data.time === 'number' ? data.time : 0,
    memory: typeof data.memory === 'number' ? data.memory : 0,
    passedTests: typeof data.passedTests === 'number' ? data.passedTests : 0,
    totalTests: typeof data.totalTests === 'number' ? data.totalTests : 0,
    message: data.message ?? null,
    testResults: Array.isArray(data.testResults) ? data.testResults : undefined,
    timeElapsedMs: data.timeElapsedMs,
  }
}

export function useSubmissionResultFlow<T extends SubmissionListRow = SubmissionListRow>(
  options: Options<T>
) {
  const {
    userId,
    enabled = true,
    openModalOnSubmit = true,
    onRefreshAfterFinal,
    onFinalApplied,
    mergeListOnUpdate,
    setSubmissions,
  } = options

  const [submitting, setSubmitting] = useState(false)
  const [currentSubmissionId, setCurrentSubmissionId] = useState<string | null>(null)
  const [judgeStatus, setJudgeStatus] = useState<{
    submissionId: string
    status: string
    passedTests: number
    totalTests: number
    testResults: unknown[]
  } | null>(null)
  const [judgeProgress, setJudgeProgress] = useState<{
    currentTest: number
    totalTests: number
  } | null>(null)
  const [lastResult, setLastResult] = useState<SubmissionResultData | null>(null)
  const [showResultModal, setShowResultModal] = useState(false)

  const currentSubmissionIdRef = useRef<string | null>(null)
  const submittingRef = useRef(false)
  const submitEpochRef = useRef(0)
  const showResultModalRef = useRef(false)
  const lastResultRef = useRef<SubmissionResultData | null>(null)
  const onRefreshRef = useRef(onRefreshAfterFinal)
  const onFinalAppliedRef = useRef(onFinalApplied)
  const mergeListRef = useRef(mergeListOnUpdate)

  useEffect(() => {
    currentSubmissionIdRef.current = currentSubmissionId
  }, [currentSubmissionId])
  useEffect(() => {
    submittingRef.current = submitting
  }, [submitting])
  useEffect(() => {
    showResultModalRef.current = showResultModal
  }, [showResultModal])
  useEffect(() => {
    lastResultRef.current = lastResult
  }, [lastResult])
  useEffect(() => {
    onRefreshRef.current = onRefreshAfterFinal
  }, [onRefreshAfterFinal])
  useEffect(() => {
    onFinalAppliedRef.current = onFinalApplied
  }, [onFinalApplied])
  useEffect(() => {
    mergeListRef.current = mergeListOnUpdate
  }, [mergeListOnUpdate])

  // 换账号 / 禁用 / 卸载时清空弹窗与进行中状态，避免跨用户串结果
  useEffect(() => {
    const resetSession = () => {
      submitEpochRef.current += 1
      submittingRef.current = false
      currentSubmissionIdRef.current = null
      showResultModalRef.current = false
      lastResultRef.current = null
      setSubmitting(false)
      setCurrentSubmissionId(null)
      setJudgeStatus(null)
      setJudgeProgress(null)
      setLastResult(null)
      setShowResultModal(false)
    }
    if (!enabled || !userId) {
      resetSession()
      return
    }
    resetSession()
    return () => {
      resetSession()
    }
  }, [userId, enabled])

  const applyModalFinalResult = useCallback((result: SubmissionResultData) => {
    if (!result.submissionId || result.submissionId !== currentSubmissionIdRef.current) return
    if (!showResultModalRef.current && !submittingRef.current) return
    const prev = lastResultRef.current
    if (prev?.submissionId === result.submissionId && prev.status === result.status) return
    submittingRef.current = false
    setSubmitting(false)
    setJudgeProgress(null)
    lastResultRef.current = result
    setLastResult(result)
    onFinalAppliedRef.current?.(result)
  }, [])

  /** 断线重连并确认入房后：补上断连窗口内可能已发出的终态 */
  const syncCurrentSubmission = useCallback(async () => {
    const watchedId = currentSubmissionIdRef.current
    const epoch = submitEpochRef.current
    if (!watchedId || !submittingRef.current) return
    try {
      const res = await fetchWithCookie(`/api/submissions/${watchedId}`, { cache: 'no-store' })
      const data = await res.json()
      if (epoch !== submitEpochRef.current) return
      if (!data.success || !data.data) return
      const sub = data.data
      if (sub.id !== currentSubmissionIdRef.current) return
      const status = sub.status as string
      if (!status || isNonFinalSubmissionStatus(status)) {
        if (typeof sub.passedTests === 'number' && typeof sub.totalTests === 'number') {
          setJudgeProgress({
            currentTest: sub.passedTests,
            totalTests: sub.totalTests,
          })
        }
        return
      }
      applyModalFinalResult({
        submissionId: sub.id,
        status,
        score: typeof sub.score === 'number' ? sub.score : 0,
        time: typeof sub.time === 'number' ? sub.time : 0,
        memory: typeof sub.memory === 'number' ? sub.memory : 0,
        passedTests: typeof sub.passedTests === 'number' ? sub.passedTests : 0,
        totalTests: typeof sub.totalTests === 'number' ? sub.totalTests : 0,
        message: sub.message ?? null,
        testResults: Array.isArray(sub.testResults) ? sub.testResults : undefined,
      })
      onRefreshRef.current?.()
    } catch {
      // 由后续 WS 事件继续驱动
    }
  }, [applyModalFinalResult])

  const { isConnected } = useSubmissionSocket({
    userId: userId || '',
    enabled: enabled && !!userId,
    onConnected: () => {
      void syncCurrentSubmission()
    },
    onSubmissionUpdate: (payload) => {
      if (payload?.id && setSubmissions && mergeListRef.current) {
        setSubmissions((prev) => {
          if (!Array.isArray(prev)) return prev
          const next = mergeListRef.current!(prev, payload)
          return next ?? prev
        })
      }

      if (payload.id !== currentSubmissionIdRef.current) return

      if (isFinalSubmissionStatus(payload.status)) {
        applyModalFinalResult(payloadToResult(payload))
        onRefreshRef.current?.()
      } else if (submittingRef.current || showResultModalRef.current) {
        setJudgeStatus({
          submissionId: payload.id,
          status: payload.status,
          passedTests: typeof payload.passedTests === 'number' ? payload.passedTests : 0,
          totalTests: typeof payload.totalTests === 'number' ? payload.totalTests : 0,
          testResults: Array.isArray(payload.testResults) ? payload.testResults : [],
        })
      }
    },
    onJudgeProgress: (data) => {
      if (data?.submissionId === currentSubmissionIdRef.current) {
        setJudgeProgress({
          currentTest: data.currentTest,
          totalTests: data.totalTests,
        })
        setJudgeStatus((prev) =>
          prev ?? {
            submissionId: data.submissionId,
            status: SubmissionStatus.JUDGING,
            passedTests: 0,
            totalTests: data.totalTests,
            testResults: [],
          }
        )
      }
    },
  })

  const beginSubmitSession = useCallback((): number => {
    if (submittingRef.current) return -1
    submittingRef.current = true
    const epoch = ++submitEpochRef.current
    currentSubmissionIdRef.current = null
    setCurrentSubmissionId(null)
    setSubmitting(true)
    setJudgeStatus(null)
    setJudgeProgress(null)
    lastResultRef.current = null
    setLastResult(null)
    if (openModalOnSubmit) {
      showResultModalRef.current = true
      setShowResultModal(true)
    }
    return epoch
  }, [openModalOnSubmit])

  const bindSubmission = useCallback((epoch: number, submissionId: string): boolean => {
    if (epoch !== submitEpochRef.current) return false
    currentSubmissionIdRef.current = submissionId
    setCurrentSubmissionId(submissionId)
    return true
  }, [])

  const abortSubmitSession = useCallback(() => {
    submittingRef.current = false
    setSubmitting(false)
    showResultModalRef.current = false
    setShowResultModal(false)
  }, [])

  const closeResultModal = useCallback(() => {
    showResultModalRef.current = false
    setShowResultModal(false)
    setJudgeStatus(null)
    lastResultRef.current = null
    setLastResult(null)
  }, [])

  const isEpochCurrent = useCallback((epoch: number) => epoch === submitEpochRef.current, [])

  return {
    submitting,
    setSubmitting,
    currentSubmissionId,
    lastResult,
    showResultModal,
    judgeProgress,
    judgeStatus,
    setJudgeStatus,
    isConnected,
    submittingRef,
    currentSubmissionIdRef,
    beginSubmitSession,
    bindSubmission,
    abortSubmitSession,
    closeResultModal,
    isEpochCurrent,
    applyModalFinalResult,
  }
}

/** 按主 Submission.id 合并列表行；列表中不存在的 id 不静默插入（须先乐观 createPending） */
export function defaultMergeSubmissionList(
  prev: SubmissionListRow[],
  data: SubmissionSocketPayload,
  _extras?: Partial<SubmissionListRow>
): SubmissionListRow[] {
  if (!Array.isArray(prev)) return prev
  const idx = prev.findIndex((s) => s?.id === data.id)
  if (idx === -1) return prev
  const next = prev.slice()
  const cur = next[idx]
  next[idx] = {
    ...cur,
    status: data.status,
    score: typeof data.score === 'number' ? data.score : cur.score,
    time: typeof data.time === 'number' ? data.time : cur.time,
    memory: typeof data.memory === 'number' ? data.memory : cur.memory,
    passedTests:
      typeof data.passedTests === 'number' ? data.passedTests : cur.passedTests,
    totalTests: typeof data.totalTests === 'number' ? data.totalTests : cur.totalTests,
    message: data.message ?? cur.message,
    assignmentSubmissionId: data.assignmentSubmissionId ?? cur.assignmentSubmissionId,
    testResults:
      Array.isArray(data.testResults) && data.testResults.length > 0
        ? data.testResults
        : cur.testResults,
  }
  return next
}

/** 乐观插入等待评测行；id 必须是主 Submission.id */
export function createPendingListRow(input: {
  id: string
  language: string
  code?: string
  extras?: Partial<SubmissionListRow>
}): SubmissionListRow {
  return {
    id: input.id,
    status: SubmissionStatus.PENDING,
    score: 0,
    time: 0,
    memory: 0,
    passedTests: 0,
    totalTests: 0,
    language: input.language,
    code: input.code,
    submittedAt: new Date().toISOString(),
    ...input.extras,
  }
}
