'use client'

import { ModalDeepLink } from '@/components/common'

/** 编辑作业已改为班级概览 / 作业详情内的模态窗 */
export default function EditAssignmentRedirectPage() {
  return <ModalDeepLink to="/classes/:id?editAssignment=:assignmentId" />
}
