'use client'

import { useEffect, useRef, useState } from 'react'
import type { Socket } from 'socket.io-client'
import {
  acquireAppSocket,
  releaseAppSocket,
  getAppSocketJoinedUserId,
  setAppSocketJoinedUserId,
} from '@/hooks/socket-client'

export interface NotificationData {
  type: 'info' | 'success' | 'warning' | 'error'
  title: string
  message: string
  unreadCount?: number
  id?: string
}

interface UseNotificationSocketOptions {
  userId: string | null
  onNotification?: (notification: NotificationData) => void
  onConnected?: () => void
  enabled?: boolean
}

export function useNotificationSocket({
  userId,
  onNotification,
  onConnected,
  enabled = true,
}: UseNotificationSocketOptions) {
  const [isConnected, setIsConnected] = useState(false)
  const socketRef = useRef<Socket | null>(null)
  const userIdRef = useRef(userId)
  const notifiedJoinedRef = useRef<string | null>(null)
  const callbacksRef = useRef({ onNotification, onConnected })

  useEffect(() => {
    callbacksRef.current = { onNotification, onConnected }
  }, [onNotification, onConnected])

  useEffect(() => {
    userIdRef.current = userId
  }, [userId])

  useEffect(() => {
    if (!enabled || !userId) {
      setIsConnected(false)
      notifiedJoinedRef.current = null
      return
    }

    const socket = acquireAppSocket(userId)
    socketRef.current = socket

    const markJoinedAndNotify = (joinedUserId: string) => {
      if (joinedUserId !== userIdRef.current) return
      setAppSocketJoinedUserId(joinedUserId)
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
      setIsConnected(true)
      notifiedJoinedRef.current = null
      ensureJoined()
    }

    const onDisconnect = () => {
      setIsConnected(false)
      setAppSocketJoinedUserId(null)
      notifiedJoinedRef.current = null
    }

    const onJoined = (payload: { userId?: string }) => {
      if (!payload?.userId) return
      markJoinedAndNotify(payload.userId)
    }

    const onNotificationEvent = (notification: NotificationData) => {
      callbacksRef.current.onNotification?.(notification)
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('joined', onJoined)
    socket.on('notification', onNotificationEvent)

    if (socket.connected) {
      setIsConnected(true)
      ensureJoined()
    }

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('joined', onJoined)
      socket.off('notification', onNotificationEvent)
      socketRef.current = null
      releaseAppSocket()
    }
  }, [userId, enabled])

  return {
    isConnected,
  }
}
