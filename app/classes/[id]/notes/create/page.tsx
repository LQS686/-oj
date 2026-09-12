'use client'

import { ModalDeepLink } from '@/components/common'

/** 创建笔记已改为班级概览页内的模态窗 */
export default function CreateNoteRedirectPage() {
  return <ModalDeepLink to="/classes/:id?createNote=1" />
}
