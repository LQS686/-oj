/**
 * /api/admin/problems/[id]/regenerate-solution - 重新生成 AI 官方题解
 *
 * 鉴权：管理员 / 教师（isAdmin 或 role=TEACHER）
 *
 * 流程：
 *  1. 校验题库存在
 *  2. 删除原 AI_OFFICIAL 题解
 *  3. 入队新的 AI 题解生成
 */
import { withApi, ok, throw400, throw403, throw404 } from '@/lib/api/withApi'
import { withPermission } from '@/lib/api/withPermission'
import { isObjectId } from '@/lib/api/validation'
import {
  deleteAiOfficialSolutionsForProblem,
  getOperatorForSolutionRegen,
  getProblemForSolutionRegeneration,
} from '@/lib/problem/service'
import { logger } from '@/lib/logger'
import { enqueueSolutionJob } from '@/lib/ai/solution-queue'

export const POST = withApi.auth(withPermission('admin.access')(async (_req, ctx, { user }) => {
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的题目 ID 格式')

  // 校验管理员 / 教师
  const dbUserResult = await getOperatorForSolutionRegen(user.id)
  const dbUser = dbUserResult as NonNullable<typeof dbUserResult>
  if (dbUser.isBanned) throw403('账号不可用')
  const isAdmin = dbUser.role === 'SYSTEM_ADMIN'
  const isTeacher = dbUser.role === 'TEACHER'
  if (!isAdmin && !isTeacher) {
    throw403('需要管理员或教师权限')
  }

  // 读取题目
  const problemResult = await getProblemForSolutionRegeneration(id)
  const problem = problemResult as NonNullable<typeof problemResult>

  // 删除原 AI_OFFICIAL 题解（保留同题的 USER 题解）
  const deleteResult = await deleteAiOfficialSolutionsForProblem(id)

  // 拼装 description（复用 solution-generator 输入）
  const description = [
    problem.description || '',
    problem.input ? `\n\n## 输入格式\n${problem.input}` : '',
    problem.output ? `\n\n## 输出格式\n${problem.output}` : '',
  ].join('')

  // 入队新的 AI 题解生成
  const { logId } = await enqueueSolutionJob({
    problemId: problem.id,
    title: problem.title,
    description,
    stdCode: problem.stdCode || undefined,
    stdLang: problem.stdLang || undefined,
    authorId: problem.authorId,
    triggeredBy: user.id,
  })

  logger.info('[admin/regenerate-solution] AI 题解重新生成任务已入队', {
    problemId: id,
    logId,
    operatorId: user.id,
    oldAiSolutionsDeleted: deleteResult.count,
  })

  return ok({ logId })
}))
