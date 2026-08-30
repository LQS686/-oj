/**
 * /api/admin/objective-questions/[id] - 管理员单个客观题操作
 *
 * GET    客观题详情（含答案与解析，供编辑回填）
 * PUT    更新客观题（题号 / 作者不可改）
 * DELETE 删除客观题（被作业引用时返回 400 IN_USE）
 */
import { withApi, ok, readJson, throw400, throw404, ApiError } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { validateObjectiveQuestionPayload } from '@/lib/objective-question/validation'
import {
  getObjectiveQuestionDetail,
  updateObjectiveQuestion,
  deleteObjectiveQuestion,
} from '@/lib/objective-question/service'

/**
 * GET /api/admin/objective-questions/[id] - 获取客观题详情（管理员）
 * 返回完整字段（含 answer / explanation）
 */
export const GET = withApi.admin(async (_req, ctx) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的题目 ID 格式')
  const question = await getObjectiveQuestionDetail(id)
  if (!question) throw404('题目不存在')
  return ok(question)
})

/**
 * PUT /api/admin/objective-questions/[id] - 更新客观题（管理员）
 * 题号由服务端生成且不可修改；校验器只读取可编辑字段，
 * body 中的 questionNumber 天然被忽略
 */
export const PUT = withApi.admin(async (req, ctx) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的题目 ID 格式')
  const body = await readJson<unknown>(req)
  const result = validateObjectiveQuestionPayload(body)
  if (!result.ok) {
    // 直接 throw（而非 throw400()）以便 TS 正确收窄 result.data
    throw new ApiError('VALIDATION', result.error, 400)
  }
  const question = await updateObjectiveQuestion(id, result.data)
  if (!question) throw404('题目不存在')
  return ok({ question, message: '题目更新成功' })
})

/**
 * DELETE /api/admin/objective-questions/[id] - 删除客观题（管理员）
 * 被作业引用时由 service 层抛 IN_USE（400）
 */
export const DELETE = withApi.admin(async (_req, ctx) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的题目 ID 格式')
  const question = await deleteObjectiveQuestion(id)
  if (!question) throw404('题目不存在')
  return ok({ question, message: '题目删除成功' })
})
