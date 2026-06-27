'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PageLoading } from '@/components/common'

/** 编辑作业已改为班级概览 / 作业详情内的模态窗 */
export default function EditAssignmentRedirectPage() {
  const params = useParams()
  const router = useRouter()
  const classId = params.id as string
  const assignmentId = params.assignmentId as string

  useEffect(() => {
    router.replace(`/classes/${classId}?editAssignment=${assignmentId}`)
  }, [classId, assignmentId, router])

  return <PageLoading label="跳转中..." />
}