'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Megaphone, Pin, ChevronRight } from 'lucide-react'
import { EducationalPageShell, PageLoading, ListEmptyState } from '@/components/common'
import { fetchWithCookie } from '@/lib/api/base'
import type { PublicAnnouncementItem } from '@/lib/announcement/service'
import { formatDate } from '@/lib/utils'
import { useAnnouncementSocket } from '@/hooks/useAnnouncementSocket'

export default function AnnouncementsListPage() {
  const [items, setItems] = useState<PublicAnnouncementItem[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAnnouncements = useCallback(() => {
    fetchWithCookie('/api/announcements?limit=20')
      .then((r) => r.json())
      .then((json) => {
        if ((json.success || json.ok) && json.data?.items) {
          setItems(json.data.items)
        }
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchWithCookie('/api/announcements?limit=20')
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && (json.success || json.ok) && json.data?.items) {
          setItems(json.data.items)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useAnnouncementSocket({
    onUpdate: () => {
      // 任意变更事件（published/updated/deleted/unpublished）都刷新列表
      fetchAnnouncements()
    },
  })

  return (
    <EducationalPageShell width="default" title="系统公告" icon={Megaphone}>
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card-static rounded-lg px-4 py-3 animate-pulse">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="h-4 w-1/3 rounded bg-muted" />
                <div className="h-3 w-16 rounded bg-muted" />
              </div>
              <div className="h-3 w-full rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <ListEmptyState icon={Megaphone} title="暂无系统公告" />
      ) : (
        <div className="space-y-1.5 animate-fadeIn">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/announcements/${item.id}`}
              className={`card-static rounded-lg px-4 py-3 block hover:border-primary/30 transition-colors ${
                item.isPinned ? 'ring-1 ring-primary/25' : ''
              }`}
            >
              <div className="flex items-start gap-2 min-w-0">
                {item.isPinned ? (
                  <Pin className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-foreground truncate">{item.title}</h3>
                    <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
                      {item.publishedAt
                        ? formatDate(item.publishedAt)
                        : formatDate(item.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{item.content}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </EducationalPageShell>
  )
}
