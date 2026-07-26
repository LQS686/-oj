'use client'

/**
 * 公告实时推送：共用 App Socket（仅 websocket），监听 announcement:update
 */
import { useEffect, useRef } from 'react'
import { acquireAppSocket, releaseAppSocket } from '@/hooks/socket-client'

export interface AnnouncementUpdateEvent {
  type: 'published' | 'unpublished' | 'updated' | 'deleted'
  id: string
  title?: string
}

interface UseAnnouncementSocketOptions {
  enabled?: boolean
  onUpdate?: (event: AnnouncementUpdateEvent) => void
  onPublished?: (event: AnnouncementUpdateEvent) => void
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

    const socket = acquireAppSocket()

    const handler = (event: AnnouncementUpdateEvent) => {
      if (!event || typeof event !== 'object') return
      onUpdateRef.current?.(event)
      if (event.type === 'published') {
        onPublishedRef.current?.(event)
      }
    }

    socket.on('announcement:update', handler)

    return () => {
      socket.off('announcement:update', handler)
      releaseAppSocket()
    }
  }, [enabled])
}
