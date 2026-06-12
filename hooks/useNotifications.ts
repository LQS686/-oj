/**
 * hooks/useNotifications.ts
 * 通知列表 + 未读数 - 走 SWR（页面可见时自动刷新）
 */
'use client'

import useSWR from 'swr'
import { swrKey } from '@/lib/api/swr'

export interface NotificationItem {
  id: string
  userId: string
  type: string
  title: string
  content: string
  link?: string
  isRead: boolean
  createdAt: string
}

export interface NotificationsResponse {
  items: NotificationItem[]
  total: number
  unreadCount: number
}

export function useNotifications() {
  const { data, error, isLoading, mutate } = useSWR<NotificationsResponse>(swrKey.notifications(), {
    refreshInterval: 60_000, // 60s 轮询
  })
  return {
    notifications: data?.items ?? [],
    total: data?.total ?? 0,
    unreadCount: data?.unreadCount ?? 0,
    isLoading,
    error,
    mutate,
  }
}
