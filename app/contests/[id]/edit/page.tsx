'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PageLoading } from '@/components/common'

/** 编辑竞赛已改为列表页内的模态窗 */
export default function EditContestRedirectPage() {
  const params = useParams()
  const router = useRouter()
  const contestId = params.id as string

  useEffect(() => {
    router.replace(`/contests?edit=${encodeURIComponent(contestId)}`)
  }, [contestId, router])

  return <PageLoading label="打开编辑…" />
}
