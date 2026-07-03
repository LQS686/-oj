/**
 * lib/problem/validation.ts
 * 题目参数校验
 */
import { required, optional, toInt, toBool, ValidationError } from '@/lib/api/validation'
import { validateObjectId } from '@/lib/api/validation'

export function parseProblemListQuery(q: Record<string, string>) {
  return {
    keyword: optional(q.keyword),
    difficulty: optional(q.difficulty) as 'easy' | 'medium' | 'hard' | undefined,
    isPublic: q.isPublic ? toBool(q.isPublic) : undefined,
    categoryId: q.categoryId ? validateObjectId(q.categoryId, 'categoryId') : undefined,
    tagIds: q.tagIds ? q.tagIds.split(',').filter(Boolean) : undefined,
    page: toInt(q.page, 'page', 1),
    pageSize: toInt(q.pageSize, 'pageSize', 20),
  }
}

export function parseProblemCreate(body: any) {
  return {
    title: required(body?.title, '题目标题'),
    description: required(body?.description, '题目描述'),
    difficulty: required(body?.difficulty, '难度'),
    timeLimit: toInt(body?.timeLimit, '时间限制', 1000),
    memoryLimit: toInt(body?.memoryLimit, '内存限制', 256),
    comparisonMode:
      body?.comparisonMode && typeof body.comparisonMode === 'string'
        ? body.comparisonMode
        : 'default',
    realPrecision: toInt(body?.realPrecision, '浮点数精度', 3),
    isPublic: body?.isPublic ? toBool(body.isPublic) : false,
    tags: body?.tags || [],
  }
}

export function parseProblemId(id: string) {
  return validateObjectId(id, 'problemId')
}
