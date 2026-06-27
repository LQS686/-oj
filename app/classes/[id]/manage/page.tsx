'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PageLoading } from '@/components/common'

/** 班级管理已合并到概览 ?tab=manage */
export default function ClassManageRedirectPage() {
  const params = useParams()
  const router = useRouter()
  const classId = params.id as string

  useEffect(() => {
    router.replace(`/classes/${classId}?tab=manage`)
  }, [classId, router])

  return <PageLoading label="跳转中..." />
}