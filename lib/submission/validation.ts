/**
 * lib/submission/validation.ts
 * 提交参数校验
 */
import { required, toInt, ValidationError } from '@/lib/api/validation'
import { validateObjectId } from '@/lib/api/validation'

export function parseSubmissionCreate(body: any) {
  const code = required(body?.code, '代码')
  if (code.length < 2) throw new ValidationError('代码内容不合法')
  return {
    problemId: validateObjectId(body?.problemId, 'problemId'),
    code,
    language: required(body?.language, '语言'),
    contestId: body?.contestId ? validateObjectId(body.contestId, 'contestId') : undefined,
    assignmentId: body?.assignmentId ? validateObjectId(body.assignmentId, 'assignmentId') : undefined,
  }
}

export function parseSubmissionListQuery(q: Record<string, string>) {
  return {
    problemId: q.problemId ? validateObjectId(q.problemId, 'problemId') : undefined,
    userId: q.userId ? validateObjectId(q.userId, 'userId') : undefined,
    status: q.status || undefined,
    language: q.language || undefined,
    page: toInt(q.page, 'page', 1),
    pageSize: toInt(q.pageSize, 'pageSize', 20),
  }
}
