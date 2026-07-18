'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Megaphone, Pin, ArrowLeft, Loader2 } from 'lucide-react'
import { EducationalPageShell, PageLoading } from '@/components/common'
import type { PublicAnnouncementDetail } from '@/lib/announcement/service'
import { fetchWithCookie } from '@/lib/api/base'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatDateTime } from '@/lib/utils'

export default function AnnouncementDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string
  const [item, setItem] = useState<PublicAnnouncementDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useDocumentTitle(item?.title)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        setError('')
        const res = await fetchWithCookie(`/api/announcements/${id}`)
        const json = await res.json()
        if (!json.success && !json.ok) {
          throw new Error(json.error || '加载失败')
        }
        if (!cancelled) setItem(json.data)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  if (loading) {
    return <PageLoading label="加载公告…" />
  }

  if (error || !item) {
    return (
      <EducationalPageShell width="narrow" title="系统公告" icon={Megaphone}>
        <div className="card-static rounded-xl p-10 text-center">
          <p className="text-error mb-4">{error || '公告不存在或已过期'}</p>
          <Link href="/" className="btn btn-primary">
            返回首页
          </Link>
        </div>
      </EducationalPageShell>
    )
  }

  return (
    <EducationalPageShell
      width="narrow"
      title="系统公告"
      icon={Megaphone}
      actions={
        <button type="button" className="btn btn-ghost" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4" />
          返回
        </button>
      }
    >
      <article
        className={`card-static rounded-xl p-6 md:p-8 ${item.isPinned ? 'ring-1 ring-primary/30' : ''}`}
      >
        <div className="flex items-start gap-2 mb-4">
          {item.isPinned && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded-full">
              <Pin className="w-3 h-3" /> 置顶
            </span>
          )}
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-4">{item.title}</h1>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mb-6 pb-6 border-b border-border">
          <span>发布者：{item.authorName}</span>
          {item.publishedAt && (
            <span>发布时间：{formatDateTime(item.publishedAt)}</span>
          )}
        </div>
        <div className="text-foreground text-base leading-relaxed whitespace-pre-wrap">{item.content}</div>
      </article>
    </EducationalPageShell>
  )
}