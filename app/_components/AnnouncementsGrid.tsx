'use client'

import Link from 'next/link'
import { Megaphone, Pin, ChevronRight } from 'lucide-react'
import type { PublicAnnouncementItem } from '@/lib/announcement/service'
import { formatDate } from '@/lib/utils'

export function AnnouncementsGrid({ items }: { items: PublicAnnouncementItem[] }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-primary" />
          <h2 className="text-base font-bold text-foreground">系统公告</h2>
        </div>
        <Link href="/announcements" className="text-xs text-primary hover:underline flex items-center gap-0.5">
          查看全部 <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">暂无系统公告</p>
      ) : (
        <div className="space-y-1.5">
          {items.slice(0, 5).map((item) => (
            <Link
              key={item.id}
              href={`/announcements/${item.id}`}
              className={`card-static rounded-lg px-3.5 py-2.5 block hover:border-primary/30 transition-colors ${
                item.isPinned ? 'ring-1 ring-primary/25' : ''
              }`}
            >
              <div className="flex items-start gap-2 min-w-0">
                {item.isPinned ? (
                  <Pin className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" aria-label="置顶" />
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-foreground truncate">{item.title}</h3>
                    <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
                      {item.publishedAt
                        ? formatDate(item.publishedAt)
                        : formatDate(item.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{item.content}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
