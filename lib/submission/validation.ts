/**
 * lib/submission/validation.ts
 * 提交参数校验
 */
import { required, toInt, ValidationError, validateObjectId, asRecord } from '@/lib/api/validation'

export function parseSubmissionCreate(body: unknown) {
  const b = asRecord(body)
  const code = required(b.code, '代码')
  if (code.length < 2) throw new ValidationError('代码内容不合法')
  return {
    problemId: validateObjectId(b.problemId, 'problemId'),
    code,
    language: required(b.language, '语言'),
    contestId: b.contestId ? validateObjectId(b.contestId, 'contestId') : undefined,
    assignmentId: b.assignmentId ? validateObjectId(b.assignmentId, 'assignmentId') : undefined,
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
