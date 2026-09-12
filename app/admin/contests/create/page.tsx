'use client'

import { ModalDeepLink } from '@/components/common'

/** 创建竞赛已改为竞赛列表页内的模态窗 */
export default function AdminCreateContestRedirectPage() {
  return <ModalDeepLink to="/admin/contests?create=1" />
}
