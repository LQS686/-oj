'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PageLoading } from '@/components/common'

/** 编辑题解已改为详情页内的模态窗 */
export default function EditSolutionRedirectPage() {
  const params = useParams()
  const router = useRouter()
  const problemId = params.id as string
  const solutionId = params.solutionId as string

  useEffect(() => {
    router.replace(
      `/problems/${encodeURIComponent(problemId)}/solutions/${encodeURIComponent(solutionId)}?edit=1`
    )
  }, [problemId, solutionId, router])

  return <PageLoading label="打开编辑…" />
}
