/**
 * 作业客观题作答提交
 * POST /api/classes/[id]/assignments/[assignmentId]/objective-submit
 *
 * 时间守卫与编程题提交接口（submitAssignmentCode）对齐：
 *   - 作业未开始（upcoming）              → 403 ASSIGNMENT_NOT_STARTED
 *   - 已结束且未开 allowLateSubmission    → 403 ASSIGNMENT_ENDED
 *   - 逾期但允许补交                      → isLate = true
 *
 * 其他校验：
 *   - questionId 不属于该作业             → 400 QUESTION_NOT_IN_ASSIGNMENT
 *   - 作答形状不合法                      → 400 INVALID_ANSWER
 *
 * 响应 data 永不包含标准答案 answer（防止答案泄露）。
 */
import { withApi, ok, readJson } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { ApiError } from '@/lib/api/errors'
import { prisma } from '@/lib/prisma'
import { getAssignmentStatus } from '@/lib/class/assignment-stats'
import {
  OBJECTIVE_QUESTION_TYPES,
  countFillBlanks,
  type ObjectiveAnswer,
  type ObjectiveQuestionOption,
  type ObjectiveQuestionType,
} from '@/lib/objective-question/types'
import { validateObjectiveAnswerShape } from '@/lib/objective-question/validation'
import { gradeObjectiveAnswer } from '@/lib/objective-question/grading'

interface ObjectiveSubmitBody {
  questionId?: unknown
  answer?: unknown
}

export const POST = withApi.classRole(
  ['owner', 'assistant', 'student'],
  async (req, ctx, { user }) => {
    const { id, assignmentId } = ctx.params
    if (!isObjectId(id) || !isObjectId(assignmentId)) {
      throw new ApiError('INVALID_ID', '无效的 ID', 400)
    }

    // 1. 解析 body：{ questionId, answer }
    const body = await readJson<ObjectiveSubmitBody>(req)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError('INVALID_BODY', '请求体必须是对象', 400)
    }
    if (typeof body.questionId !== 'string') {
      throw new ApiError('MISSING_FIELDS', '缺少题目 ID', 400)
    }
    if (!isObjectId(body.questionId)) {
      throw new ApiError('INVALID_ID', '无效的题目 ID', 400)
    }
    const questionId = body.questionId
    const rawAnswer = body.answer

    // 2. 查询作业（objectiveQuestionIds + 时间守卫字段）
    const assignment = await prisma.classAssignment.findUnique({
      where: { id: assignmentId, classId: id },
      select: {
        objectiveQuestionIds: true,
        startTime: true,
        endTime: true,
        allowLateSubmission: true,
      },
    })
    if (!assignment) {
      throw new ApiError('NOT_FOUND', '作业不存在', 404)
    }

    // 3. 题目必须属于该作业
    if (!assignment.objectiveQuestionIds.includes(questionId)) {
      throw new ApiError('QUESTION_NOT_IN_ASSIGNMENT', '该题目不属于此作业', 400)
    }

    // 4. 查询题目（answer / explanation 仅服务端判分用，不回传客户端）
    const question = await prisma.objectiveQuestion.findUnique({
      where: { id: questionId },
      select: {
        type: true,
        title: true,
        options: true,
        answer: true,
        score: true,
        explanation: true,
      },
    })
    if (!question) {
      throw new ApiError('NOT_FOUND', '题目不存在', 404)
    }

    const type = question.type as ObjectiveQuestionType
    // 防御：历史脏数据的题型不合法时拒绝，避免判分函数落入未知分支
    if (!OBJECTIVE_QUESTION_TYPES.includes(type)) {
      throw new ApiError('INVALID_QUESTION_TYPE', '题型不合法', 400)
    }
    const options = Array.isArray(question.options)
      ? (question.options as unknown as ObjectiveQuestionOption[])
      : null

    // 5. 时间守卫（对齐 submitAssignmentCode 的判定模式）
    const status = getAssignmentStatus(assignment.startTime, assignment.endTime)
    if (status === 'upcoming') {
      throw new ApiError('ASSIGNMENT_NOT_STARTED', '作业尚未开始，无法提交', 403)
    }

    const endAt = assignment.endTime ? new Date(assignment.endTime) : null
    const now = new Date()
    let isLate = endAt ? now > endAt : false

    if (status === 'ended') {
      if (!assignment.allowLateSubmission) {
        throw new ApiError('ASSIGNMENT_ENDED', '作业已结束，不接受新提交', 403)
      }
      // 允许逾期提交：强制 isLate = true（即使 endTime 刚过）
      isLate = true
    }

    // 6. 作答形状校验（填空题按题干空位数校验长度）
    const expectedBlankCount =
      type === 'fill-blank' ? countFillBlanks(question.title) : undefined
    if (!validateObjectiveAnswerShape(type, rawAnswer, options, expectedBlankCount)) {
      throw new ApiError('INVALID_ANSWER', '作答格式不正确', 400)
    }
    const studentAnswer = rawAnswer as ObjectiveAnswer

    // 7. 服务端判分：正确 = 题目分值，错误 = 0
    const referenceAnswer = Array.isArray(question.answer)
      ? (question.answer as unknown as ObjectiveAnswer)
      : []
    const { isCorrect } = gradeObjectiveAnswer(type, referenceAnswer, studentAnswer)
    const score = isCorrect ? question.score : 0

    // 8. upsert（@@unique([assignmentId, userId, questionId])，同题只保留最新作答）
    const submission = await prisma.classAssignmentObjectiveSubmission.upsert({
      where: {
        assignmentId_userId_questionId: {
          assignmentId,
          userId: user.id,
          questionId,
        },
      },
      create: {
        assignmentId,
        userId: user.id,
        questionId,
        answer: studentAnswer,
        isCorrect,
        score,
        submitCount: 1,
        submittedAt: now,
        isLate,
      },
      update: {
        answer: studentAnswer,
        isCorrect,
        score,
        submittedAt: now,
        isLate,
        submitCount: { increment: 1 },
      },
    })

    // 9. 响应（绝不返回标准答案 answer）
    return ok({
      isCorrect,
      score,
      explanation: question.explanation,
      submitCount: submission.submitCount,
      submittedAt: new Date(submission.submittedAt).toISOString(),
      isLate: submission.isLate,
    })
  }
)
