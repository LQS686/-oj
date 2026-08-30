/**
 * lib/objective-question/service.ts
 * 客观题服务层：管理端 CRUD + 只读列表（教师选题 / 学生练习用）
 *
 * 约定：
 * - 列表查询 select 一律排除 answer / explanation，防止答案泄露（只读接口绝不返回答案）
 * - questionNumber 由服务端自动生成（"Q" + 递增数字，起始 1001），创建后不可修改
 * - 被作业（classAssignment.objectiveQuestionIds）引用的题目禁止删除，保护作业完整性
 */
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { ApiError, errorLike } from '@/lib/api/errors'
import type {
  ObjectiveAnswer,
  ObjectiveQuestionDetail,
  ObjectiveQuestionListItem,
  ObjectiveQuestionOption,
  ObjectiveQuestionType,
} from './types'
import type { ValidatedObjectiveQuestionInput } from './validation'

/* ============================================================================
 * 参数与返回类型
 * ========================================================================== */

/** 管理端列表参数 */
export interface ObjectiveQuestionListParams {
  /** 关键字：questionNumber 精确匹配 或 title 模糊匹配（不区分大小写） */
  keyword?: string
  /** 题型过滤（ObjectiveQuestionType 之一） */
  type?: string
  /** 难度过滤（'简单' | '中等' | '困难'） */
  difficulty?: string
  /** 标签过滤（单标签命中） */
  tag?: string
  page?: number
  pageSize?: number
}

/** 只读列表参数（教师选题用，不含 tag 筛选与 usageCount） */
export interface ObjectiveQuestionPublicListParams {
  keyword?: string
  type?: string
  difficulty?: string
  page?: number
  pageSize?: number
}

/** 列表统一返回结构（只读列表的 list 不含 usageCount） */
export interface ObjectiveQuestionListResult {
  list: ObjectiveQuestionListItem[]
  total: number
  page: number
  pageSize: number
}

/* ============================================================================
 * 内部工具
 * ========================================================================== */

/** 列表通用 select：明确排除 answer / explanation（防止答案泄露） */
const LIST_SELECT = {
  id: true,
  questionNumber: true,
  type: true,
  title: true,
  options: true,
  difficulty: true,
  tags: true,
  score: true,
  updatedAt: true,
}

/** 分页参数防御性规范化：page ≥ 1（默认 1），pageSize 1-100（默认 20） */
function normalizePagination(page?: number, pageSize?: number) {
  const p = Number.isFinite(page) ? Math.max(1, Math.floor(page as number)) : 1
  const rawSize =
    Number.isFinite(pageSize) && (pageSize as number) > 0
      ? Math.floor(pageSize as number)
      : 20
  return { page: p, pageSize: Math.min(Math.max(1, rawSize), 100) }
}

/**
 * 组合列表筛选条件：
 * - keyword：questionNumber 精确 或 title contains（参照既有 problem 搜索的 OR 模式）
 * - type / difficulty：精确匹配；top-level 条件之间天然 AND
 */
function buildListWhere(
  keyword: string | undefined,
  type: string | undefined,
  difficulty: string | undefined,
  tag?: string,
): Prisma.ObjectiveQuestionWhereInput {
  const where: Prisma.ObjectiveQuestionWhereInput = {}
  const kw = keyword?.trim()
  if (kw) {
    where.OR = [
      { questionNumber: kw },
      { title: { contains: kw, mode: 'insensitive' as const } },
    ]
  }
  if (type) where.type = type
  if (difficulty) where.difficulty = difficulty
  if (tag) where.tags = { has: tag }
  return where
}

/** Prisma 完整记录 → 客观题详情 DTO（含 answer / explanation，仅供管理端编辑回填） */
function toObjectiveQuestionDetail(q: {
  id: string
  questionNumber: string | null
  type: string
  title: string
  options: Prisma.JsonValue | null
  answer: Prisma.JsonValue
  explanation: string | null
  difficulty: string
  tags: string[]
  score: number
  authorId: string
  createdAt: Date
  updatedAt: Date
}): ObjectiveQuestionDetail {
  return {
    id: q.id,
    questionNumber: q.questionNumber,
    type: q.type as ObjectiveQuestionType,
    title: q.title,
    options: q.options as ObjectiveQuestionOption[] | null,
    answer: Array.isArray(q.answer) ? (q.answer as ObjectiveAnswer) : [],
    explanation: q.explanation,
    difficulty: q.difficulty,
    tags: q.tags,
    score: q.score,
    authorId: q.authorId,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
  }
}

/* ============================================================================
 * 列表
 * ========================================================================== */

/**
 * 管理端客观题列表（含每题被作业引用次数 usageCount）
 * 按题号升序；select 明确排除 answer / explanation
 */
export async function listObjectiveQuestions(
  params: ObjectiveQuestionListParams,
): Promise<ObjectiveQuestionListResult> {
  const { page, pageSize } = normalizePagination(params.page, params.pageSize)
  const where = buildListWhere(params.keyword, params.type, params.difficulty, params.tag)

  const [rows, total, assignments] = await Promise.all([
    prisma.objectiveQuestion.findMany({
      where,
      orderBy: { questionNumber: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: LIST_SELECT,
    }),
    prisma.objectiveQuestion.count({ where }),
    // usageCount：一次取全部作业的客观题引用列表，内存计数每题被引用次数
    prisma.classAssignment.findMany({
      select: { objectiveQuestionIds: true },
    }),
  ])

  const usageByQuestion = new Map<string, number>()
  for (const assignment of assignments) {
    for (const questionId of assignment.objectiveQuestionIds || []) {
      usageByQuestion.set(questionId, (usageByQuestion.get(questionId) ?? 0) + 1)
    }
  }

  const list: ObjectiveQuestionListItem[] = rows.map((row) => ({
    ...row,
    type: row.type as ObjectiveQuestionType,
    options: row.options as ObjectiveQuestionOption[] | null,
    usageCount: usageByQuestion.get(row.id) ?? 0,
  }))

  return { list, total, page, pageSize }
}

/**
 * 只读客观题列表（教师选题 / 学生练习用，登录即可访问）
 * 按题号升序；select 明确排除 answer / explanation，响应绝不包含答案
 */
export async function listObjectiveQuestionsPublic(
  params: ObjectiveQuestionPublicListParams,
): Promise<ObjectiveQuestionListResult> {
  const { page, pageSize } = normalizePagination(params.page, params.pageSize)
  const where = buildListWhere(params.keyword, params.type, params.difficulty)

  const [rows, total] = await Promise.all([
    prisma.objectiveQuestion.findMany({
      where,
      orderBy: { questionNumber: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: LIST_SELECT,
    }),
    prisma.objectiveQuestion.count({ where }),
  ])

  const list: ObjectiveQuestionListItem[] = rows.map((row) => ({
    ...row,
    type: row.type as ObjectiveQuestionType,
    options: row.options as ObjectiveQuestionOption[] | null,
  }))

  return { list, total, page, pageSize }
}

/* ============================================================================
 * 详情 / 创建 / 更新 / 删除
 * ========================================================================== */

/** 客观题详情（含 answer / explanation，供管理端编辑回填）；不存在返回 null */
export async function getObjectiveQuestionDetail(
  id: string,
): Promise<ObjectiveQuestionDetail | null> {
  const question = await prisma.objectiveQuestion.findUnique({ where: { id } })
  return question ? toObjectiveQuestionDetail(question) : null
}

/**
 * 创建客观题（questionNumber 服务端自动生成，authorId 取当前登录用户）
 *
 * 题号规则：查询现有所有题号，解析出最大数字编号（格式 "Q" + 数字），
 * 新题号 = 最大 + 1；无记录时起始 "Q1001"。
 * 并发冲突（P2002 唯一约束）时 +1 重试一次（管理端低频操作，足够）。
 */
export async function createObjectiveQuestion(
  input: ValidatedObjectiveQuestionInput,
  authorId: string,
): Promise<ObjectiveQuestionDetail> {
  const rows = await prisma.objectiveQuestion.findMany({
    select: { questionNumber: true },
  })
  let maxNumber = 1000
  for (const row of rows) {
    const match = row.questionNumber ? /^Q(\d+)$/.exec(row.questionNumber) : null
    if (match) {
      const num = parseInt(match[1], 10)
      if (num > maxNumber) maxNumber = num
    }
  }

  const data = {
    type: input.type,
    title: input.title,
    // ObjectiveQuestionOption 是 interface（无隐式索引签名），需断言为 JSON 输入类型
    options: input.options as unknown as Prisma.InputJsonValue | null,
    answer: input.answer,
    explanation: input.explanation,
    difficulty: input.difficulty,
    tags: input.tags,
    score: input.score,
    authorId,
  }

  try {
    const question = await prisma.objectiveQuestion.create({
      data: { ...data, questionNumber: `Q${maxNumber + 1}` },
    })
    return toObjectiveQuestionDetail(question)
  } catch (err) {
    // 题号唯一冲突：+1 重试一次
    if (errorLike(err).code === 'P2002') {
      const question = await prisma.objectiveQuestion.create({
        data: { ...data, questionNumber: `Q${maxNumber + 2}` },
      })
      return toObjectiveQuestionDetail(question)
    }
    throw err
  }
}

/** 更新客观题（questionNumber / authorId 不可改）；不存在返回 null */
export async function updateObjectiveQuestion(
  id: string,
  input: ValidatedObjectiveQuestionInput,
): Promise<ObjectiveQuestionDetail | null> {
  try {
    const question = await prisma.objectiveQuestion.update({
      where: { id },
      data: {
        type: input.type,
        title: input.title,
        options: input.options as unknown as Prisma.InputJsonValue | null,
        answer: input.answer,
        explanation: input.explanation,
        difficulty: input.difficulty,
        tags: input.tags,
        score: input.score,
      },
    })
    return toObjectiveQuestionDetail(question)
  } catch (err) {
    if (errorLike(err).code === 'P2025') return null
    throw err
  }
}

/** 删除客观题；被作业引用时抛 IN_USE（400），不存在返回 null */
export async function deleteObjectiveQuestion(
  id: string,
): Promise<ObjectiveQuestionDetail | null> {
  // 引用检查：被作业引用的题目禁止删除（保护作业完整性）
  const usageCount = await prisma.classAssignment.count({
    where: { objectiveQuestionIds: { has: id } },
  })
  if (usageCount > 0) {
    throw new ApiError('IN_USE', `该题目已被 ${usageCount} 个作业引用，无法删除`, 400)
  }
  try {
    const question = await prisma.objectiveQuestion.delete({ where: { id } })
    return toObjectiveQuestionDetail(question)
  } catch (err) {
    if (errorLike(err).code === 'P2025') return null
    throw err
  }
}
