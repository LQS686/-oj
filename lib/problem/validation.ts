/**
 * lib/problem/validation.ts
 * 题目参数校验
 *
 * 难度校验对齐洛谷 8 档标准（lib/constants.ts 为唯一真相源）：
 *   入门 / 普及- / 普及 / 普及+ / 提高 / 提高+ / 省选 / NOI
 */
import { required, optional, toInt, ValidationError, validateObjectId, asRecord } from '@/lib/api/validation'
import { isValidDifficulty, DIFFICULTIES } from '@/lib/constants'

export function parseProblemListQuery(q: Record<string, string>) {
  const rawDifficulty = optional(q.difficulty)
  if (rawDifficulty && !isValidDifficulty(rawDifficulty)) {
    throw new ValidationError(`难度值无效，必须是：${DIFFICULTIES.join(' / ')}`)
  }
  return {
    keyword: optional(q.keyword),
    difficulty: rawDifficulty && isValidDifficulty(rawDifficulty) ? rawDifficulty : undefined,
    visibility:
      q.visibility === 'public' || q.visibility === 'private' || q.visibility === 'contest'
        ? q.visibility
        : undefined,
    categoryId: q.categoryId ? validateObjectId(q.categoryId, 'categoryId') : undefined,
    tagIds: q.tagIds ? q.tagIds.split(',').filter(Boolean) : undefined,
    page: toInt(q.page, 'page', 1),
    pageSize: toInt(q.pageSize, 'pageSize', 20),
  }
}

export function parseProblemCreate(body: unknown) {
  const b = asRecord(body)
  const difficulty = required(b.difficulty, '难度')
  if (!isValidDifficulty(difficulty)) {
    throw new ValidationError(`难度值无效，必须是：${DIFFICULTIES.join(' / ')}`)
  }
  return {
    title: required(b.title, '题目标题'),
    description: required(b.description, '题目描述'),
    difficulty,
    timeLimit: toInt(b.timeLimit, '时间限制', 1000),
    memoryLimit: toInt(b.memoryLimit, '内存限制', 256),
    comparisonMode:
      b.comparisonMode && typeof b.comparisonMode === 'string'
        ? b.comparisonMode
        : 'default',
    realPrecision: toInt(b.realPrecision, '浮点数精度', 3),
    visibility:
      b.visibility === 'public' || b.visibility === 'private' || b.visibility === 'contest'
        ? b.visibility
        : 'private',
    tags: Array.isArray(b.tags) ? b.tags : [],
  }
}

export function parseProblemId(id: string) {
  return validateObjectId(id, 'problemId')
}
