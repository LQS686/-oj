'use client'

import { ModalDeepLink } from '@/components/common'

/** 班级作业已合并到班级概览页 */
export default function ClassAssignmentsRedirectPage() {
  return <ModalDeepLink to="/classes/:id" />
}
