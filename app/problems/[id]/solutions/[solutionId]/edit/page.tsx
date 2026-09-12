'use client'

import { ModalDeepLink } from '@/components/common'

/** 编辑题解已改为详情页内的模态窗 */
export default function EditSolutionRedirectPage() {
  return <ModalDeepLink to="/problems/:id/solutions/:solutionId?edit=1" label="打开编辑…" />
}
