/**
 * 邀请码加入已下线，请使用：用户名邀请 或 申请加入
 */
import { withApi, throw400 } from '@/lib/api/withApi'

export const POST = withApi.auth(async () => {
  throw400(
    'FEATURE_REMOVED',
    '邀请码加入已取消。请通过管理员的用户名邀请，或在公开班级列表中申请加入。'
  )
})