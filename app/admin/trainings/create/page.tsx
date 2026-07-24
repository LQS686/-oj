'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PageLoading } from '@/components/common'

/** 创建题单已改为题单列表页内的模态窗 */
export default function AdminCreateTrainingRedirectPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/admin/trainings?create=1')
  }, [router])
  return <PageLoading label="跳转中..." />
}
