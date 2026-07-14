'use client'

import { useEffect, useState, useRef } from 'react'
import { io, Socket } from 'socket.io-client'

interface NotificationData {
  type: 'info' | 'success' | 'warning' | 'error'
  title: string
  message: string
}

interface UseNotificationSocketOptions {
  userId: string | null
  onNotification?: (notification: NotificationData) => void
  enabled?: boolean
}

export function useNotificationSocket({
  userId,
  onNotification,
  enabled = true,
}: UseNotificationSocketOptions) {
  const socketRef = useRef<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [lastNotification, setLastNotification] = useState<NotificationData | null>(null)

  const callbackRef = useRef(onNotification)

  useEffect(() => {
    callbackRef.current = onNotification
  }, [onNotification])

  useEffect(() => {
    if (typeof window === 'undefined') return

    if (!enabled || !userId) {
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
        setIsConnected(false)
      }
      return
    }

    if (socketRef.current?.connected) {
      return
    }

    const socket = io({
      path: '/socket.io/',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      auth: {
        userId: userId,
      },
    })

    socketRef.current = socket

    socket.on('connect', () => {
      setIsConnected(true)
      socket.emit('join', userId)
    })

    socket.on('joined', () => {
      // Successfully joined notification room
    })

    socket.on('notification', (notification: NotificationData) => {
      setLastNotification(notification)

      if (callbackRef.current) {
        callbackRef.current(notification)
      }
    })

    socket.on('disconnect', () => {
      setIsConnected(false)
    })

    socket.on('reconnect', () => {
      setIsConnected(true)
      socket.emit('join', userId)
    })

    socket.on('connect_error', () => {
      setIsConnected(false)
    })

    return () => {
      if (socket.connected) {
        socket.emit('leave', userId)
      }
      socket.disconnect()
      socketRef.current = null
    }
  }, [userId, enabled])

  return {
    isConnected,
    lastNotification,
  }
}
