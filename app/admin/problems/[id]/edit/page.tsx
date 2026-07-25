'use client'

import { use } from 'react'
import AdminProblemForm from '@/components/admin/AdminProblemForm'

export default function AdminEditProblemPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  return <AdminProblemForm problemId={id} />
}
