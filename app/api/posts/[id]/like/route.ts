/**
 * /api/posts/[id]/like - 切换帖子点赞
 */
import { withApi, ok, throw400 } from '@/lib/api/withApi'
import { togglePostLikeMongo } from '@/lib/post/service'
import { isObjectId } from '@/lib/api/validation'

export const POST = withApi.auth(async (req, ctx, { user }) => {
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的帖子ID')

  const result = await togglePostLikeMongo(user.id, id)
  return ok({
    data: result,
    message: result.isLiked ? '点赞成功' : '已取消点赞',
  })
})
