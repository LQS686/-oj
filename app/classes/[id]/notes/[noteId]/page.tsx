'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PageLoading } from '@/components/common'

/** 笔记改为班级概览内模态窗阅读，旧链接重定向并带上 note 参数 */
export default function NoteDetailRedirectPage() {
  const params = useParams()
  const router = useRouter()
  const classId = params.id as string
  const noteId = params.noteId as string

  useEffect(() => {
    router.replace(`/classes/${classId}?note=${encodeURIComponent(noteId)}`)
  }, [classId, noteId, router])

  return <PageLoading label="打开笔记…" />
}
