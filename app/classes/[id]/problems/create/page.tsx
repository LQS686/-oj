'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PageLoading } from '@/components/common'

/** 班级独立题库已移除：请在作业中从主题库选题 */
export default function CreateClassProblemRedirectPage() {
  const params = useParams()
  const router = useRouter()
  const classId = params.id as string

  useEffect(() => {
    router.replace(`/classes/${classId}`)
  }, [classId, router])

  return <PageLoading label="跳转中..." />
}
