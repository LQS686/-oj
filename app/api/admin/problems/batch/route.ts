/**
 * /api/admin/problems/batch - 批量题目操作（管理员）
 *
 * action: 'visibility' | 'difficulty' | 'delete'
 */
import { withApi, ok, readJson } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import {
  batchDeleteProblems,
  batchUpdateProblemDifficulty,
  batchUpdateProblemVisibility,
  validateBatchProblemInput,
} from '@/lib/problem/service'

export const POST = withApi.admin(async (req, _ctx) => {
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
