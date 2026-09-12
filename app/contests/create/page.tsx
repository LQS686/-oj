'use client'

import { ModalDeepLink } from '@/components/common'

/** 创建竞赛已改为竞赛列表页内的模态窗 */
export default function CreateContestRedirectPage() {
  return <ModalDeepLink to="/contests?create=1" />
}
