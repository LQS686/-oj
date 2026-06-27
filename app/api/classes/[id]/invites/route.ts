/**
 * 邀请码功能已移除
 */
import { withApi, throw400 } from '@/lib/api/withApi'

const msg = '邀请码功能已移除，请使用用户名邀请或学生申请加入'

export const GET = withApi.auth(async () => {
  throw400('FEATURE_REMOVED', msg)
})

export const POST = withApi.auth(async () => {
  throw400('FEATURE_REMOVED', msg)
})