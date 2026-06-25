'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Megaphone, Pin, ChevronRight } from 'lucide-react'
import { EducationalPageShell, PageLoading } from '@/components/common'
import type { PublicAnnouncementItem } from '@/lib/announcement/service'

export default function AnnouncementsListPage() {
  const [items, setItems] = useState<PublicAnnouncementItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/announcements?limit=20')
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

  if (loading) {
    return <PageLoading label="加载公告…" />
  }

  return (
    <EducationalPageShell
      width="default"
      title="系统公告"
      description="平台通知与重要说明"
      icon={Megaphone}
    >
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-12 text-center">暂无系统公告</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/announcements/${item.id}`}
              className={`card-static rounded-xl p-5 block hover:border-primary/30 transition-colors h-full ${
                item.isPinned ? 'ring-1 ring-primary/30' : ''
              }`}
            >
              <div className="flex items-center justify-between mb-2 gap-1">
                {item.isPinned ? (
                  <Pin className="w-3.5 h-3.5 text-primary shrink-0" />
                ) : (
                  <span className="w-3.5" />
                )}
                <span className="text-xs text-muted-foreground truncate">
                  {item.publishedAt
                    ? new Date(item.publishedAt).toLocaleDateString('zh-CN')
                    : new Date(item.createdAt).toLocaleDateString('zh-CN')}
                </span>
              </div>
              <h3 className="text-sm font-semibold text-foreground line-clamp-2 mb-2">{item.title}</h3>
              <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">{item.content}</p>
              <span className="text-xs text-primary mt-3 inline-flex items-center gap-0.5">
                查看详情 <ChevronRight className="w-3 h-3" />
              </span>
            </Link>
          ))}
        </div>
      )}
    </EducationalPageShell>
  )
}