/**
 * WebSocket 驱动的未读通知：连接/重连与回前台时各同步一次，无周期性轮询。
 */
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { notificationApi } from '@/lib/api'
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
  const onNotificationRef = useRef(onNotification)
  useEffect(() => {
    onNotificationRef.current = onNotification
  }, [onNotification])

  const syncUnread = useCallback(async () => {
    if (!userId) {
      setUnreadCount(0)
      return
    }
    try {
      const data = await notificationApi.getNotifications(1, 1)
      setUnreadCount(data.unreadCount)
    } catch (error) {
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

  useEffect(() => {
    if (!enabled || !userId) {
      setUnreadCount(0)
      return
    }

    // 未读数由「入房成功 onConnected」拉取；此处只处理回前台补同步
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
