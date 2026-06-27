'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PageLoading } from '@/components/common'

/** 笔记列表已合并到班级概览 */
export default function ClassNotesRedirectPage() {
  const params = useParams()
  const router = useRouter()
  const classId = params.id as string

  useEffect(() => {
    router.replace(`/classes/${classId}`)
  }, [classId, router])

  return <PageLoading label="跳转中..." />
}