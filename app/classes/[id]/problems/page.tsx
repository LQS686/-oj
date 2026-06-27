'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PageLoading } from '@/components/common'

/** 班级题目功能已移除 */
export default function ClassProblemsRemovedPage() {
  const params = useParams()
  const router = useRouter()
  const classId = params.id as string

  useEffect(() => {
    router.replace(`/classes/${classId}`)
  }, [classId, router])

  return <PageLoading label="跳转中..." />
}