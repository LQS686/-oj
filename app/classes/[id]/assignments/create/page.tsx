'use client'

import { ModalDeepLink } from '@/components/common'

/** 创建作业已改为班级概览内的模态窗 */
export default function CreateAssignmentRedirectPage() {
  return <ModalDeepLink to="/classes/:id?createAssignment=1" />
}
