/**
 * 邀请码功能已移除
 */
import { withApi, throw400 } from '@/lib/api/withApi'

export const DELETE = withApi.auth(async () => {
  throw400('FEATURE_REMOVED', '邀请码功能已移除')
})