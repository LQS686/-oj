'use client'

import { useEffect, useRef, useState } from 'react'
import type { Socket } from 'socket.io-client'
import { acquireAppSocket, releaseAppSocket } from '@/hooks/socket-client'

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
      return
    }

    const socket = acquireAppSocket()
    socketRef.current = socket

    const onConnect = () => {
      setIsConnected(true)
      if (userIdRef.current) {
        socket.emit('join', userIdRef.current)
      }
      callbacksRef.current.onConnected?.()
    }

    const onDisconnect = () => setIsConnected(false)

    const onNotificationEvent = (notification: NotificationData) => {
      callbacksRef.current.onNotification?.(notification)
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('notification', onNotificationEvent)

    if (socket.connected) {
      onConnect()
    }

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('notification', onNotificationEvent)
      socketRef.current = null
      releaseAppSocket()
    }
  }, [userId, enabled])

  return {
    isConnected,
  }
}
