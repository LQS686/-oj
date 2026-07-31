'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PageLoading } from '@/components/common'

/** 班级独立题库已移除：题目仅存在于主题库，班级通过作业引用 */
export default function ClassProblemsRemovedPage() {
  const params = useParams()
  const router = useRouter()
  const classId = params.id as string

  useEffect(() => {
    router.replace(`/classes/${classId}`)
  }, [classId, router])

  return <PageLoading label="跳转中..." />
}
