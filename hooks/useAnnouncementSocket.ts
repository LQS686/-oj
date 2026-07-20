'use client'

/**
 * 公告实时推送 hook
 *
 * 监听 WebSocket 事件 'announcement:update'，在管理员发布/更新/删除公告时
 * 自动触发回调，让前端可以无刷新地获取最新公告列表。
 *
 * 事件载荷（由 lib/announcement/service.ts 广播）：
 *   - { type: 'published', id, title }：新发布公告 → 建议弹 toast + 刷新
 *   - { type: 'unpublished', id }：撤回公告 → 刷新
 *   - { type: 'updated', id }：公告更新 → 刷新
 *   - { type: 'deleted', id }：公告删除 → 刷新
 *
 * 与 useNotificationSocket 不同：
 *   - useNotificationSocket：监听 'notification' 事件，按 userId 房间隔离（私人通知）
 *   - useAnnouncementSocket：监听 'announcement:update' 事件，广播到 'broadcast:public' 房间（全员可见）
 *
 * 复用同一个 socket 连接（socket.io-client 单例），避免重复建连。
 */
import { useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'

export interface AnnouncementUpdateEvent {
  type: 'published' | 'unpublished' | 'updated' | 'deleted'
  id: string
  title?: string
}

interface UseAnnouncementSocketOptions {
  /** 是否启用（如未登录可禁用） */
  enabled?: boolean
  /** 收到任意公告变更事件时触发（前端通常调用 mutate 刷新列表） */
  onUpdate?: (event: AnnouncementUpdateEvent) => void
  /** 仅收到 'published' 事件时触发（前端弹 toast 提示新公告） */
  onPublished?: (event: AnnouncementUpdateEvent) => void
}

// 复用全局 socket 单例（与 useNotificationSocket 共享同一连接）
// 避免每个 hook 都建立独立连接，浪费资源
let sharedSocket: Socket | null = null
let referenceCount = 0

function getSharedSocket(): Socket | null {
  if (typeof window === 'undefined') return null
  if (sharedSocket?.connected) return sharedSocket

  try {
    sharedSocket = io({
      path: '/socket.io/',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      withCredentials: true,
    })
    return sharedSocket
  } catch {
    return null
  }
}

function releaseSharedSocket() {
  referenceCount = Math.max(0, referenceCount - 1)
  if (referenceCount === 0 && sharedSocket) {
    try {
      sharedSocket.disconnect()
    } catch {
      // 忽略
    }
    sharedSocket = null
  }
}

export function useAnnouncementSocket({
  enabled = true,
  onUpdate,
  onPublished,
}: UseAnnouncementSocketOptions = {}) {
  const onUpdateRef = useRef(onUpdate)
  const onPublishedRef = useRef(onPublished)

  useEffect(() => {
    onUpdateRef.current = onUpdate
    onPublishedRef.current = onPublished
  }, [onUpdate, onPublished])

  useEffect(() => {
    if (typeof window === 'undefined' || !enabled) return

    const socket = getSharedSocket()
    if (!socket) return

    referenceCount++

    const handler = (event: AnnouncementUpdateEvent) => {
      if (!event || typeof event !== 'object') return
      onUpdateRef.current?.(event)
      if (event.type === 'published') {
        onPublishedRef.current?.(event)
      }
    }

    socket.on('announcement:update', handler)

    // 服务端在 socket connection 时已自动调用 joinPublicRoom，
    // 此处无需显式 emit('join:public')。

    return () => {
      socket.off('announcement:update', handler)
      releaseSharedSocket()
    }
  }, [enabled])
}
