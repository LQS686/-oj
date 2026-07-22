'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PageLoading } from '@/components/common'

/** 新建题解已改为题解列表页内的模态窗 */
export default function NewSolutionRedirectPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const problemId = params?.id ?? ''
  useEffect(() => {
    router.replace(`/problems/${problemId}/solutions?create=1`)
  }, [router, problemId])
  return <PageLoading label="跳转中..." />
}
