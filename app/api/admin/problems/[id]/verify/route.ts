/**
 * POST /api/admin/problems/[id]/verify - 验证 AI 生成的题目
 */
import { withApi, ok, readJson, throw400 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { isSystemAdmin } from '@/lib/permissions'
import { applyProblemVerification } from '@/lib/problem/service'

export const POST = withApi.admin(async (req, ctx, { user }) => {
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的题目ID')

  const body = await readJson<{
    action?: 'accept' | 'reject' | 'fix' | 'archive'
    message?: string
    isAiGenerated?: boolean
  }>(req)

  if (!body.action || !['accept', 'reject', 'fix', 'archive'].includes(body.action)) {
    throw400('INVALID_ACTION', '无效的操作类型')
  }

  return ok(
    await applyProblemVerification({
      id: id!,
      verifierId: user.id,
      isAdmin: isSystemAdmin(user),
      decision: body.action as 'accept' | 'reject' | 'fix' | 'archive',
      message: body.message,
      isAiGenerated: body.isAiGenerated ?? true,
    })
  )
})
