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
      // 修复 P0：移除 auth.userId，依赖 cookie 服务端验签，
      // 防止前端伪造 userId 监听他人通知。
      withCredentials: true,
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

    // 修复 P1：防御性校验 - 即使服务端做了房间隔离，前端也校验消息归属
    // （当前 NotificationData 无 userId 字段，仅在服务端有；
    //  若未来加入，校验 data.userId === userId）
    if (typeof (socket as any).use === 'function') {
      ;(socket as any).use((packet: any[], next: (err?: Error) => void) => {
        if (packet[0] === 'notification' && packet[1]?.userId && packet[1].userId !== userId) {
          return next(new Error('Notification from foreign user'))
        }
        next()
      })
    }

    socket.on('disconnect', () => {
      setIsConnected(false)
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
