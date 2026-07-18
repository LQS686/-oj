/**
 * lib/problem/validation.ts
 * 题目参数校验
 *
 * 难度校验对齐洛谷 8 档标准（lib/constants.ts 为唯一真相源）：
 *   入门 / 普及- / 普及 / 普及+ / 提高 / 提高+ / 省选 / NOI
 */
import { required, optional, toInt, toBool, ValidationError } from '@/lib/api/validation'
import { validateObjectId } from '@/lib/api/validation'
import { isValidDifficulty, migrateDifficulty, DIFFICULTIES } from '@/lib/constants'

export function parseProblemListQuery(q: Record<string, string>) {
  // 难度查询参数：允许 8 档标准值或旧版值（自动迁移为 8 档）
  const rawDifficulty = optional(q.difficulty)
  const difficulty = rawDifficulty
    ? isValidDifficulty(rawDifficulty)
      ? rawDifficulty
      : migrateDifficulty(rawDifficulty, undefined as any)
    : undefined
  return {
    keyword: optional(q.keyword),
    difficulty,
    isPublic: q.isPublic ? toBool(q.isPublic) : undefined,
    categoryId: q.categoryId ? validateObjectId(q.categoryId, 'categoryId') : undefined,
    tagIds: q.tagIds ? q.tagIds.split(',').filter(Boolean) : undefined,
    page: toInt(q.page, 'page', 1),
    pageSize: toInt(q.pageSize, 'pageSize', 20),
  }
}

export function parseProblemCreate(body: any) {
  const rawDifficulty = required(body?.difficulty, '难度')
  // 难度规范化：8 档直接通过，旧版 4 档/英文值自动迁移为 8 档标准
  const difficulty = isValidDifficulty(rawDifficulty)
    ? rawDifficulty
    : migrateDifficulty(rawDifficulty)
  return {
    title: required(body?.title, '题目标题'),
    description: required(body?.description, '题目描述'),
    difficulty,
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
