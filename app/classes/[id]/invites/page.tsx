'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PageLoading } from '@/components/common'

export default function ClassInvitesRedirectPage() {
  const params = useParams()
  const router = useRouter()
  const classId = params.id as string

  useEffect(() => {
    router.replace(`/classes/${classId}?tab=manage`)
  }, [classId, router])

  return <PageLoading label="跳转中..." />
}