'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PageLoading } from '@/components/common'

/** 创建班级已改为班级列表页内的模态窗 */
export default function CreateClassRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/classes?create=1')
  }, [router])

  return <PageLoading label="跳转中..." />
}