'use client'

import { ModalDeepLink } from '@/components/common'

/** 班级成员已合并到班级概览页 */
export default function ClassMembersRedirectPage() {
  return <ModalDeepLink to="/classes/:id" />
}
