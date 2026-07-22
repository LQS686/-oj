'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PageLoading } from '@/components/common'

/** 创建竞赛已改为竞赛列表页内的模态窗 */
export default function CreateContestRedirectPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/contests?create=1')
  }, [router])
  return <PageLoading label="跳转中..." />
}
