'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PageLoading } from '@/components/common'

/** 创建竞赛已改为竞赛列表页内的模态窗 */
export default function AdminCreateContestRedirectPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/admin/contests?create=1')
  }, [router])
  return <PageLoading label="跳转中..." />
}
