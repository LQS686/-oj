/**
 * lib/solution/validation.ts
 * 题解参数校验
 */
import { required, optional, toInt, toBool } from '@/lib/api/validation'
import { validateObjectId } from '@/lib/api/validation'

export function parseSolutionListQuery(q: Record<string, string>) {
  return {
    problemId: q.problemId ? validateObjectId(q.problemId, 'problemId') : undefined,
    isPublic: q.isPublic ? toBool(q.isPublic) : undefined,
    page: toInt(q.page, 'page', 1),
    pageSize: toInt(q.pageSize, 'pageSize', 20),
  }
}

export function parseSolutionCreate(body: any) {
  return {
    problemId: validateObjectId(body?.problemId, 'problemId'),
    title: required(body?.title, '标题'),
    content: required(body?.content, '内容'),
    isPublic: body?.isPublic ? toBool(body.isPublic) : true,
  }
}
