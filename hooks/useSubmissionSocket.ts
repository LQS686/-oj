/**
 * WebSocket Hook - 实时接收提交状态更新（共用 App Socket，仅 websocket）
 *
 * 入房由服务端认证后自动完成；客户端仅在尚未入房时 emit('join') 一次。
 */

import { useEffect, useRef, useState } from 'react'
import type { Socket } from 'socket.io-client'
import { logger } from '@/lib/logger'
import {
  acquireAppSocket,
  releaseAppSocket,
  getAppSocketJoinedUserId,
  setAppSocketJoinedUserId,
} from '@/hooks/socket-client'

interface SubmissionUpdate {
  id: string
  status: string
  score: number
  time: number
  memory: number
  passedTests: number
  totalTests: number
  problemId?: string
  message?: string
  testResults?: Array<{
    testId: string
    status: string
    time: number
    memory: number
    message?: string
  }>
  timeElapsedMs?: number
  assignmentSubmissionId?: string
}

interface JudgeProgress {
  submissionId: string
  currentTest: number
  totalTests: number
  status: string
}

interface Notification {
  type: 'info' | 'success' | 'warning' | 'error'
  title: string
  message: string
}

interface UseSubmissionSocketOptions {
  userId: string
  onSubmissionUpdate?: (data: SubmissionUpdate) => void
  onJudgeProgress?: (data: JudgeProgress) => void
  onNotification?: (data: Notification) => void
  /** 已确认进入 user 房间后回调（断线重连补状态） */
  onConnected?: () => void
  watchSubmissionId?: string
  enabled?: boolean
}

export function useSubmissionSocket({
  userId,
  onSubmissionUpdate,
  onJudgeProgress,
  onNotification,
  onConnected,
  watchSubmissionId,
  enabled = true,
}: UseSubmissionSocketOptions) {
  const [isConnected, setIsConnected] = useState(false)
  const socketRef = useRef<Socket | null>(null)
  const watchSubmissionIdRef = useRef(watchSubmissionId)
  const userIdRef = useRef(userId)
  /** 本 hook 实例是否已对当前 joinedUser 触发过 onConnected */
  const notifiedJoinedRef = useRef<string | null>(null)

  const callbacksRef = useRef({
    onSubmissionUpdate,
    onJudgeProgress,
    onNotification,
    onConnected,
  })

  useEffect(() => {
    callbacksRef.current = {
      onSubmissionUpdate,
      onJudgeProgress,
      onNotification,
      onConnected,
    }
  }, [onSubmissionUpdate, onJudgeProgress, onNotification, onConnected])

  useEffect(() => {
    userIdRef.current = userId
  }, [userId])

  useEffect(() => {
    watchSubmissionIdRef.current = watchSubmissionId
    const socket = socketRef.current
    if (!socket?.connected) return
    if (watchSubmissionId) {
      socket.emit('watchSubmission', watchSubmissionId)
    } else {
      socket.emit('unwatchSubmission')
    }
  }, [watchSubmissionId])

  useEffect(() => {
    if (!enabled || !userId) {
      setIsConnected(false)
      notifiedJoinedRef.current = null
      return
    }

    const socket = acquireAppSocket()
    socketRef.current = socket

    const markJoinedAndNotify = (joinedUserId: string) => {
      if (joinedUserId !== userIdRef.current) return
      setAppSocketJoinedUserId(joinedUserId)

      const watchId = watchSubmissionIdRef.current
      if (watchId) {
        socket.emit('watchSubmission', watchId)
      }

      if (notifiedJoinedRef.current === joinedUserId) return
      notifiedJoinedRef.current = joinedUserId
      callbacksRef.current.onConnected?.()
    }

    const ensureJoined = () => {
      const uid = userIdRef.current
      if (!uid) return
      if (getAppSocketJoinedUserId() === uid) {
        markJoinedAndNotify(uid)
        return
      }
      socket.emit('join', uid)
    }

    const onConnect = () => {
      logger.debug('WebSocket 已连接', { id: socket.id })
      setIsConnected(true)
      notifiedJoinedRef.current = null
      ensureJoined()
    }

    const onDisconnect = (reason: string) => {
      logger.debug('WebSocket 断开连接', { reason })
      setIsConnected(false)
      setAppSocketJoinedUserId(null)
      notifiedJoinedRef.current = null
    }

    const onJoined = (payload: { userId?: string }) => {
      if (!payload?.userId) return
      markJoinedAndNotify(payload.userId)
    }

    const onSubmission = (data: SubmissionUpdate) => {
      callbacksRef.current.onSubmissionUpdate?.(data)
    }
    const onProgress = (data: JudgeProgress) => {
      callbacksRef.current.onJudgeProgress?.(data)
    }
    const onNotify = (data: Notification) => {
      callbacksRef.current.onNotification?.(data)
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('joined', onJoined)
    socket.on('submission:update', onSubmission)
    socket.on('judge:progress', onProgress)
    socket.on('notification', onNotify)

    if (socket.connected) {
      setIsConnected(true)
      ensureJoined()
    }

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('joined', onJoined)
      socket.off('submission:update', onSubmission)
      socket.off('judge:progress', onProgress)
      socket.off('notification', onNotify)
      if (watchSubmissionIdRef.current) {
        socket.emit('unwatchSubmission', watchSubmissionIdRef.current)
      }
      socketRef.current = null
      releaseAppSocket()
    }
  }, [userId, enabled])

  return {
    isConnected,
  }
}
