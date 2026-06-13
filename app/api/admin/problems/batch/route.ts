/**
 * /api/admin/problems/batch - 批量题目操作（管理员）
 *
 * action: 'visibility' | 'difficulty' | 'delete'
 */
import { withApi, ok, readJson, throw403 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import {
  batchDeleteProblems,
  batchUpdateProblemDifficulty,
  batchUpdateProblemVisibility,
  validateBatchProblemInput,
} from '@/lib/problem/service'

export const POST = withApi.auth(async (req, _ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }

  const body = await readJson<{
    action?: string
    problemIds?: string[]
    visibility?: string
    difficulty?: string
  }>(req)

  const validated = validateBatchProblemInput({ ...body, isObjectId })

  if (validated.action === 'visibility') {
    const updateRes = await batchUpdateProblemVisibility(validated.problemIds, validated.visibility!)
    return ok({ updatedCount: updateRes.count, deletedCount: 0 })
  }
  if (validated.action === 'difficulty') {
    const updateRes = await batchUpdateProblemDifficulty(validated.problemIds, validated.difficulty!)
    return ok({ updatedCount: updateRes.count, deletedCount: 0 })
  }
  // delete
  const deleteRes = await batchDeleteProblems(validated.problemIds)
  return ok({ updatedCount: 0, deletedCount: deleteRes.count })
})
