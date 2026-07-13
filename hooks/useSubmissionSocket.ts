/**
 * WebSocket Hook - 实时接收提交状态更新
 */

import { useEffect, useRef, useState } from 'react'
import io, { Socket } from 'socket.io-client'
import { logger } from '@/lib/logger'

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
  testResults?: any[]
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
  enabled?: boolean
}

export function useSubmissionSocket({
  userId,
  onSubmissionUpdate,
  onJudgeProgress,
  onNotification,
  enabled = true,
}: UseSubmissionSocketOptions) {
  const socketRef = useRef<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  // 使用 useRef 保存回调函数，避免因回调更新导致重新连接
  const callbacksRef = useRef({
    onSubmissionUpdate,
    onJudgeProgress,
    onNotification,
  })

  // 更新回调引用
  useEffect(() => {
    callbacksRef.current = {
      onSubmissionUpdate,
      onJudgeProgress,
      onNotification,
    }
  }, [onSubmissionUpdate, onJudgeProgress, onNotification])

  useEffect(() => {
    // 如果禁用或没有 userId，不连接
    if (!enabled || !userId) {
      // 清理现有连接
      if (socketRef.current) {
        logger.debug('清理现有 WebSocket 连接')
        socketRef.current.disconnect()
        socketRef.current = null
      }
      setIsConnected(false)
      return
    }

    // 如果已经有连接，不重复连接
    if (socketRef.current?.connected) {
      logger.debug('WebSocket 已连接，跳过重复连接')
      return
    }

    logger.debug('开始连接 WebSocket...')

    const socketUrl = typeof window !== 'undefined'
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000')

    const socket = io(socketUrl, {
      path: '/socket.io/',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      auth: {
        // Token 通过 httpOnly cookie 自动携带（socket.handshake.headers.cookie），无需显式传递
      },
    })

    socketRef.current = socket

    // 连接事件
    socket.on('connect', () => {
      logger.debug('WebSocket 已连接', { id: socket.id })
      setIsConnected(true)

      // 加入用户房间
      socket.emit('join', userId)
    })

    // 确认加入房间
    socket.on('joined', (data) => {
      logger.debug('已加入房间', data)
    })

    // 断开事件
    socket.on('disconnect', (reason) => {
      logger.debug('WebSocket 断开连接', { reason })
      setIsConnected(false)
    })

    // 重连事件
    socket.on('reconnect', (attemptNumber) => {
      logger.debug(`WebSocket 重连成功 (尝试 ${attemptNumber} 次)`)
      setIsConnected(true)
      socket.emit('join', userId)
    })

    // 提交状态更新
    socket.on('submission:update', (data: SubmissionUpdate) => {
      logger.debug('收到提交更新', data)
      callbacksRef.current.onSubmissionUpdate?.(data)
    })

    // 评测进度
    socket.on('judge:progress', (data: JudgeProgress) => {
      logger.debug('收到评测进度', data)
      callbacksRef.current.onJudgeProgress?.(data)
    })

    // 系统通知
    socket.on('notification', (data: Notification) => {
      logger.debug('收到通知', data)
      callbacksRef.current.onNotification?.(data)
    })

    // 错误处理
    socket.on('error', (error) => {
      logger.error('WebSocket 错误', error)
    })

    socket.on('connect_error', (error) => {
      logger.error('WebSocket 连接错误', error)
      setIsConnected(false)
    })

    // 清理函数
    return () => {
      logger.debug('清理 WebSocket 连接')
      if (socket.connected) {
        socket.emit('leave', userId)
      }
      socket.disconnect()
      socketRef.current = null
    }
  }, [userId, enabled]) // 只依赖 userId 和 enabled，避免回调函数导致的重新连接

  return {
    isConnected,
  }
}
