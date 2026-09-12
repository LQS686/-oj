'use client'

import { ModalDeepLink } from '@/components/common'

/** 创建题单已改为题单列表页内的模态窗 */
export default function CreateTrainingRedirectPage() {
  return <ModalDeepLink to="/admin/trainings?create=1" />
}
