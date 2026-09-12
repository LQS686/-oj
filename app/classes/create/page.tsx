'use client'

import { ModalDeepLink } from '@/components/common'

/** 创建班级已改为班级列表页内的模态窗 */
export default function CreateClassRedirectPage() {
  return <ModalDeepLink to="/classes?create=1" />
}
