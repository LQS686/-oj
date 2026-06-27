'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PageLoading } from '@/components/common'

/** 创建作业已改为班级概览内的模态窗 */
export default function CreateAssignmentRedirectPage() {
  const params = useParams()
  const router = useRouter()
  const classId = params.id as string

  useEffect(() => {
    router.replace(`/classes/${classId}?createAssignment=1`)
  }, [classId, router])

  return <PageLoading label="跳转中..." />
}