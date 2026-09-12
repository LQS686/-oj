'use client'

import { ModalDeepLink } from '@/components/common'

/** 班级笔记已合并到班级概览页 */
export default function ClassNotesRedirectPage() {
  return <ModalDeepLink to="/classes/:id" />
}
