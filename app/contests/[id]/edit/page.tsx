'use client'

import { ModalDeepLink } from '@/components/common'

/** 编辑竞赛已改为列表页内的模态窗 */
export default function EditContestRedirectPage() {
  return <ModalDeepLink to="/contests?edit=:id" label="打开编辑…" />
}
