'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PageLoading } from '@/components/common'

/**
 * 班级独立题详情已移除。
 * 若仍有旧链接带 problemId，尝试导向主题库做题页。
 */
export default function ClassProblemDetailRedirectPage() {
  const params = useParams()
  const router = useRouter()
  const classId = params.id as string
  const problemId = params.problemId as string

  useEffect(() => {
    if (problemId) {
      router.replace(`/problem/${problemId}`)
      return
    }
    router.replace(`/classes/${classId}`)
  }, [classId, problemId, router])

  return <PageLoading label="跳转中..." />
}
