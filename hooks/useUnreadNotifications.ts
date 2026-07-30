/**
 * WebSocket 驱动的未读通知：连接/重连与回前台时各同步一次，无周期性轮询。
 */
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useDeferredEffect } from '@/hooks/useDeferredEffect'
import { notificationApi } from '@/lib/api/notification'
import { logger } from '@/lib/logger'
import { useNotificationSocket, type NotificationData } from '@/hooks/useNotificationSocket'

type Options = {
  userId: string | null | undefined
  enabled?: boolean
  /** 收到推送时的额外副作用（桌面通知、刷新列表等） */
  onNotification?: (notification: NotificationData) => void
}

export function useUnreadNotifications({
  userId,
  enabled = true,
  onNotification,
}: Options) {
  const [unreadCount, setUnreadCount] = useState(0)
  const userIdRef = useRef(userId)
  const onNotificationRef = useRef(onNotification)
  useEffect(() => {
    onNotificationRef.current = onNotification
  }, [onNotification])
  useEffect(() => {
    userIdRef.current = userId
  }, [userId])

  const syncUnread = useCallback(async () => {
    const uid = userId
    if (!uid) {
      setUnreadCount(0)
      return
    }
    try {
      const data = await notificationApi.getNotifications(1, 1)
      // 忽略换账号后的过期响应，避免 A 的未读数写到 B
      if (userIdRef.current !== uid) return
      setUnreadCount(typeof data.unreadCount === 'number' ? data.unreadCount : 0)
    } catch (error) {
      // 拉取失败时保留上次未读数，避免网络抖动把角标清成 0
      if (userIdRef.current !== uid) return
      if (process.env.NODE_ENV !== 'test') {
        logger.error('同步未读通知失败', error)
      }
    }
  }, [userId])

  const { isConnected } = useNotificationSocket({
    userId: userId || null,
    enabled: enabled && !!userId,
    onConnected: () => {
      void syncUnread()
    },
    onNotification: (notification) => {
      if (typeof notification.unreadCount === 'number') {
        setUnreadCount(notification.unreadCount)
      } else {
        setUnreadCount((c) => c + 1)
      }
      onNotificationRef.current?.(notification)
    },
  })

  useDeferredEffect(() => {
    if (!enabled || !userId) {
      setUnreadCount(0)
      return
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void syncUnread()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [enabled, userId, syncUnread])

  return {
    unreadCount,
    setUnreadCount,
    refresh: syncUnread,
    isConnected,
  }
}
