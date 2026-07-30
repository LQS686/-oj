/**
 * lib/solution/validation.ts
 * 题解参数校验
 */
import { required, toInt, toBool, validateObjectId, asRecord } from '@/lib/api/validation'

export function parseSolutionListQuery(q: Record<string, string>) {
  return {
    problemId: q.problemId ? validateObjectId(q.problemId, 'problemId') : undefined,
    isPublic: q.isPublic ? toBool(q.isPublic) : undefined,
    page: toInt(q.page, 'page', 1),
    pageSize: toInt(q.pageSize, 'pageSize', 20),
  }
}

export function parseSolutionCreate(body: unknown) {
  const b = asRecord(body)
  return {
    problemId: validateObjectId(b.problemId, 'problemId'),
    title: required(b.title, '标题'),
    content: required(b.content, '内容'),
    isPublic: b.isPublic ? toBool(b.isPublic) : true,
  }
}
