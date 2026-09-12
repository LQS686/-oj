'use client'

import { ModalDeepLink } from '@/components/common'

/** 创建班级已改为班级列表页内的模态窗 */
export default function AdminCreateClassRedirectPage() {
  return <ModalDeepLink to="/admin/classes?create=1" />
}
