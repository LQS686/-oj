import { withApi, ok, throw400, ApiError, resolveViewerFromRequest } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { listTrainingProblemsWithStatus } from '@/lib/training/service'
import { canViewTraining, loadTrainingAccess } from '@/lib/training/access'

export const GET = withApi.public(async (req, ctx) => {
  const { id } = (ctx as { params: { id: string } }).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的训练计划ID')

  const viewer = await resolveViewerFromRequest(req)
  const userId = viewer?.user.id ?? null

  const access = await loadTrainingAccess(id)
  if (!access || !(await canViewTraining(access, userId))) {
    throw new ApiError('NOT_FOUND', '训练计划不存在', 404)
  }

  const result = await listTrainingProblemsWithStatus(id, userId)
  if (!result) throw new ApiError('NOT_FOUND', '训练计划不存在', 404)

  return ok(result)
})
