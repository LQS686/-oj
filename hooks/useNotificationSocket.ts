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

    console.log('🔌 连接 WebSocket 通知服务...')

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
      console.log('✅ WebSocket 已连接:', socket.id)
      setIsConnected(true)

      socket.emit('join', userId)
    })

    socket.on('joined', (data: { userId: string; room: string }) => {
      console.log(`✅ 已加入通知房间: ${data.room}`)
    })

    socket.on('notification', (notification: NotificationData) => {
      console.log('🔔 收到通知:', notification)
      setLastNotification(notification)

      if (callbackRef.current) {
        callbackRef.current(notification)
      }
    })

    socket.on('disconnect', (reason) => {
      console.log('❌ WebSocket 断开:', reason)
      setIsConnected(false)
    })

    socket.on('reconnect', (attemptNumber) => {
      console.log('🔄 WebSocket 重新连接成功:', attemptNumber)
      setIsConnected(true)
      socket.emit('join', userId)
    })

    socket.on('connect_error', (error) => {
      console.error('❌ WebSocket 连接错误:', error)
      setIsConnected(false)
    })

    return () => {
      console.log('🧹 清理 WebSocket 连接')
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
