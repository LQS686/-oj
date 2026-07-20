'use client'

import Link from 'next/link'
import { Megaphone, Pin, ChevronRight } from 'lucide-react'
import type { PublicAnnouncementItem } from '@/lib/announcement/service'
import { formatDate } from '@/lib/utils'

export function AnnouncementsGrid({ items }: { items: PublicAnnouncementItem[] }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold text-foreground">系统公告</h2>
        </div>
        <Link href="/announcements" className="text-sm text-primary hover:underline flex items-center gap-1">
          查看全部 <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">暂无系统公告</p>
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
                  <Pin className="w-3.5 h-3.5 text-primary shrink-0" aria-label="置顶" />
                ) : (
                  <span className="w-3.5" />
                )}
                <span className="text-xs text-muted-foreground truncate">
                  {item.publishedAt
                    ? formatDate(item.publishedAt)
                    : formatDate(item.createdAt)}
                </span>
              </div>
              <h3 className="text-sm font-semibold text-foreground line-clamp-2 mb-2">{item.title}</h3>
              <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">{item.content}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
