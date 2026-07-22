'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PageLoading } from '@/components/common'

/** 创建笔记已改为班级概览页内的模态窗 */
export default function CreateNoteRedirectPage() {
  const router = useRouter()
  const params = useParams()
  const classId = params.id as string
  useEffect(() => {
    router.replace(`/classes/${classId}?createNote=1`)
  }, [router, classId])
  return <PageLoading label="跳转中..." />
}
