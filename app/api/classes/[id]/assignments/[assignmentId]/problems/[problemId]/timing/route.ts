/**
 * 班级作业题目计时
 *
 * POST /api/classes/[id]/assignments/[assignmentId]/problems/[problemId]/timing
 *   body: { action: 'start' | 'pause' | 'resume' }
 *   - start / resume：启动或恢复计时（已统一由 startOrResumeTiming 处理）
 *   - pause：暂停计时
 *
 * GET /api/classes/[id]/assignments/[assignmentId]/problems/[problemId]/timing
 *   返回当前 progress（含实时累计用时，未创建则返回 null）
 *
 * 权限校验：
 *   - 用户必须为该班级成员
 *   - 作业必须存在且属于该班级
 *   - 题目必须属于该作业（assignment.problemIds 包含 problemId）
 *
 * 幂等性：
 *   - startOrResumeTiming / pauseTiming / finalizeTiming 内部均已做幂等处理
 *   - 已完成（completedAt != null）的题目不再计时，仅展示最终用时
 */
import { withApi, ok, readJson, throw400, throw403, throw404, ApiError } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import {
  findClassAssignment,
  getCurrentClassMember,
  getAssignmentStatus,
} from '@/lib/class/service'
import {
  startOrResumeTiming,
  pauseTiming,
  getProgress,
} from '@/lib/gamification/timing'

type TimingAction = 'start' | 'pause' | 'resume'

/**
 * 公共校验：班级成员 + 作业存在 + 题目属于作业 + 作业时间窗口状态
 * 返回 { assignment, member, status } 供 handler 使用
 */
async function validateTimingContext(classId: string, assignmentId: string, problemId: string, userId: string) {
  if (!isObjectId(classId) || !isObjectId(assignmentId) || !isObjectId(problemId)) {
    throw400('INVALID_ID', '无效的 ID')
  }

  // 1. 班级成员校验
  const member = await getCurrentClassMember(classId, userId)
  if (!member) throw403('只有班级成员可以进行作业计时')

  // 2. 作业存在且属于该班级
  const assignment = await findClassAssignment(assignmentId, classId)
  if (!assignment) throw404('作业不存在')

  // 3. 题目必须属于该作业
  //    使用 optional chaining 避免 TS narrowing 误报（throw404 的 never 返回类型在某些场景下未被识别）
  if (!assignment?.problemIds?.includes(problemId)) throw404('题目不属于该作业')

  // 4. 作业时间窗口状态（upcoming / active / ended）
  //    使用 optional chaining 以兼容 throw404 的 never 返回类型未被 TS narrowing 识别的场景
  const status = getAssignmentStatus(assignment?.startTime, assignment?.endTime)

  return { assignment, member, status }
}

export const POST = withApi.auth(async (req, ctx, { user }) => {
  const { id, assignmentId, problemId } = ctx.params

  const { status } = await validateTimingContext(id, assignmentId, problemId, user.id)

  const body = await readJson<{ action?: TimingAction }>(req)
  const action = body.action
  if (action !== 'start' && action !== 'pause' && action !== 'resume') {
    throw400('INVALID_ACTION', "action 必须为 'start' | 'pause' | 'resume'")
  }

  // start 与 resume 统一由 startOrResumeTiming 处理（内部幂等）
  if (action === 'start' || action === 'resume') {
    // 校验作业时间窗口
    if (status === 'upcoming') {
      throw new ApiError('ASSIGNMENT_NOT_STARTED', '作业尚未开始', 403)
    }
    if (status === 'ended') {
      // 已完成的题目：返回最终用时，不再重启计时
      const progress = await getProgress(assignmentId, problemId, user.id)
      if (progress?.completedAt) {
        return ok({ action, progress })
      }
      throw new ApiError('ASSIGNMENT_ENDED', '作业已结束', 403)
    }
    // active 状态，正常处理
    const progress = await startOrResumeTiming(assignmentId, problemId, user.id)
    return ok({
      action,
      progress,
    })
  }

  // action === 'pause'，始终允许（即便作业已结束，也允许暂停未完成的计时）
  const progress = await pauseTiming(assignmentId, problemId, user.id)
  return ok({
    action: 'pause',
    progress,
  })
})

export const GET = withApi.auth(async (req, ctx, { user }) => {
  const { id, assignmentId, problemId } = ctx.params

  await validateTimingContext(id, assignmentId, problemId, user.id)

  const progress = await getProgress(assignmentId, problemId, user.id)
  return ok({ progress })
})
