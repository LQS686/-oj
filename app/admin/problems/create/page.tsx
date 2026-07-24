'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PageLoading } from '@/components/common'

/** 创建题目已改为题目列表页内的模态窗 */
export default function AdminCreateProblemRedirectPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/admin/problems?create=1')
  }, [router])
  return <PageLoading label="跳转中..." />
}
