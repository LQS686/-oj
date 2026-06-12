/**
 * 作业代码提交（评测）
 * POST /api/classes/[id]/assignments/[assignmentId]/submit
 */
import { withApi, ok, readJson, throw400, throw403 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { submitAssignmentCode } from '@/lib/class/service'
import { prisma } from '@/lib/prisma'

export const POST = withApi.auth(async (req, ctx, { user }) => {
  const { id, assignmentId } = (ctx as any).params
  if (!isObjectId(id) || !isObjectId(assignmentId)) {
    throw400('INVALID_ID', '无效的 ID')
  }

  const body = await readJson<{ problemId?: string; code?: string; language?: string }>(req)
  if (!body.problemId || !body.code || !body.language) {
    throw400('MISSING_FIELDS', '缺少必填字段')
  }
  if (body.code!.trim().length < 10) {
    throw400('CODE_TOO_SHORT', '代码长度不能少于10个字符')
  }

  const member = await prisma.classMember.findUnique({
    where: { classId_userId: { classId: id, userId: user.id } },
  })
  if (!member) throw403('只有班级成员可以提交代码')

  const result = await submitAssignmentCode({
    classId: id,
    assignmentId,
    userId: user.id,
    problemId: body.problemId!,
    code: body.code!,
    language: body.language!,
  })

  if (!result.ok) {
    if (result.code === 404) throw400('NOT_FOUND', result.reason || '资源不存在')
    throw400('SUBMIT_FAILED', result.reason || '提交失败')
  }

  return ok(
    {
      submissionId: result.submissionId!,
      data: result.submission!,
      message: result.isLate
        ? '代码已提交（逾期），正在评测中...'
        : '代码已提交，正在评测中...',
      isLate: result.isLate,
    },
    { status: 201 }
  )
})
