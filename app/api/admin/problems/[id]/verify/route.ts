/**
 * POST /api/admin/problems/[id]/verify
 * 标程验证并自动纠正测试点输出
 */
import { withApi, ok, readJson, throw400 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { verifyProblemWithStd } from '@/lib/problem/verify-std'

export const POST = withApi.admin(async (req, ctx, { user }) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的题目 ID')

  const body = await readJson<{
    solutionCode?: string
    solutionLanguage?: string
  }>(req)

  const result = await verifyProblemWithStd({
    problemId: id!,
    operatorId: user.id,
    solutionCode: body.solutionCode || '',
    solutionLanguage: body.solutionLanguage || '',
  })

  return ok(result)
})
