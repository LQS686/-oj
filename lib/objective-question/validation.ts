/**
 * 客观题载荷校验与学生作答形状校验（纯函数，不依赖数据库）
 */
import {
  OBJECTIVE_QUESTION_TYPES,
  countFillBlanks,
  type ObjectiveAnswer,
  type ObjectiveQuestionOption,
  type ObjectiveQuestionType,
} from './types'

/** 合法难度档位 */
export const OBJECTIVE_DIFFICULTIES = ['简单', '中等', '困难'] as const

/** 难度档位类型 */
export type ObjectiveDifficulty = (typeof OBJECTIVE_DIFFICULTIES)[number]

/** 校验通过后的规范化客观题输入 */
export interface ValidatedObjectiveQuestionInput {
  /** 题型 */
  type: ObjectiveQuestionType
  /** 题干（已 trim；填空题含 ≥1 个 ____ 空位标记） */
  title: string
  /** 选项（单选/多选已规范化；判断/填空为 null） */
  options: ObjectiveQuestionOption[] | null
  /** 标准答案（多选已排序去重） */
  answer: ObjectiveAnswer
  /** 难度 */
  difficulty: ObjectiveDifficulty
  /** 标签（已 trim、剔除空项） */
  tags: string[]
  /** 建议分值（1-100，默认 5） */
  score: number
  /** 解析（默认 null） */
  explanation: string | null
}

/** 选项 key 合法格式：单个 A-Z 大写字母 */
const OPTION_KEY_PATTERN = /^[A-Z]$/

/**
 * 校验创建/更新客观题的载荷，通过则返回规范化后的输入。
 * 所有错误信息为中文，可直接展示给前端。
 */
export function validateObjectiveQuestionPayload(
  input: unknown,
): { ok: true; data: ValidatedObjectiveQuestionInput } | { ok: false; error: string } {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, error: '载荷必须是对象' }
  }
  const raw = input as Record<string, unknown>

  // 题型
  if (
    typeof raw.type !== 'string' ||
    !OBJECTIVE_QUESTION_TYPES.includes(raw.type as ObjectiveQuestionType)
  ) {
    return { ok: false, error: '题型不合法' }
  }
  const type = raw.type as ObjectiveQuestionType

  // 题干
  if (typeof raw.title !== 'string') {
    return { ok: false, error: '题干必须是字符串' }
  }
  const title = raw.title.trim()
  if (title.length === 0) {
    return { ok: false, error: '题干不能为空' }
  }
  if (title.length > 2000) {
    return { ok: false, error: '题干不能超过 2000 字符' }
  }
  if (type === 'fill-blank' && countFillBlanks(title) < 1) {
    return { ok: false, error: '填空题题干必须包含至少一个空位（____）' }
  }

  // 选项：选择题必填（2-8 项）；判断/填空必须为 null/undefined
  let options: ObjectiveQuestionOption[] | null = null
  if (type === 'single-choice' || type === 'multiple-choice') {
    if (!Array.isArray(raw.options)) {
      return { ok: false, error: '选择题必须提供选项数组' }
    }
    if (raw.options.length < 2 || raw.options.length > 8) {
      return { ok: false, error: '选项数量必须在 2-8 个之间' }
    }
    const seenKeys = new Set<string>()
    const normalizedOptions: ObjectiveQuestionOption[] = []
    for (const item of raw.options) {
      if (typeof item !== 'object' || item === null) {
        return { ok: false, error: '选项格式不合法' }
      }
      const { key, content } = item as Record<string, unknown>
      if (typeof key !== 'string' || !OPTION_KEY_PATTERN.test(key)) {
        return { ok: false, error: '选项 key 必须是 A-Z 的大写字母' }
      }
      if (seenKeys.has(key)) {
        return { ok: false, error: `选项 key 重复：${key}` }
      }
      if (typeof content !== 'string' || content.trim().length === 0) {
        return { ok: false, error: '选项内容不能为空' }
      }
      seenKeys.add(key)
      normalizedOptions.push({ key, content: content.trim() })
    }
    options = normalizedOptions
  } else if (raw.options !== null && raw.options !== undefined) {
    return { ok: false, error: '判断题/填空题不能提供选项' }
  }

  // 标准答案（逐题型校验）
  if (!Array.isArray(raw.answer)) {
    return { ok: false, error: '答案必须是数组' }
  }
  const optionKeys = options !== null ? options.map((o) => o.key) : []
  let answer: ObjectiveAnswer
  switch (type) {
    case 'single-choice': {
      if (raw.answer.length !== 1) {
        return { ok: false, error: '单选题答案必须恰好包含 1 个选项' }
      }
      const v = raw.answer[0]
      if (typeof v !== 'string' || !optionKeys.includes(v)) {
        return { ok: false, error: '单选题答案必须是选项之一' }
      }
      answer = [v]
      break
    }
    case 'multiple-choice': {
      if (raw.answer.length < 2) {
        return { ok: false, error: '多选题答案至少包含 2 个选项' }
      }
      const seen = new Set<string>()
      for (const v of raw.answer) {
        if (typeof v !== 'string' || !optionKeys.includes(v)) {
          return { ok: false, error: '多选题答案必须是选项之一' }
        }
        if (seen.has(v)) {
          return { ok: false, error: '多选题答案不能重复' }
        }
        seen.add(v)
      }
      answer = [...seen].sort()
      break
    }
    case 'true-false': {
      if (raw.answer.length !== 1 || typeof raw.answer[0] !== 'boolean') {
        return { ok: false, error: '判断题答案必须是布尔值（true/false）' }
      }
      answer = [raw.answer[0]]
      break
    }
    case 'fill-blank': {
      const blankCount = countFillBlanks(title)
      if (raw.answer.length !== blankCount) {
        return {
          ok: false,
          error: `填空题答案数量（${raw.answer.length}）必须与空位数（${blankCount}）一致`,
        }
      }
      const fills: string[] = []
      for (const v of raw.answer) {
        if (typeof v !== 'string' || v.trim().length === 0) {
          return { ok: false, error: '填空题答案每项不能为空' }
        }
        fills.push(v)
      }
      answer = fills
      break
    }
  }

  // 难度
  if (
    typeof raw.difficulty !== 'string' ||
    !OBJECTIVE_DIFFICULTIES.includes(raw.difficulty as ObjectiveDifficulty)
  ) {
    return { ok: false, error: '难度必须是「简单」「中等」「困难」之一' }
  }
  const difficulty = raw.difficulty as ObjectiveDifficulty

  // 标签：可选；trim 后空项剔除，最终 ≤8 个
  let tags: string[] = []
  if (raw.tags !== null && raw.tags !== undefined) {
    if (!Array.isArray(raw.tags)) {
      return { ok: false, error: '标签必须是字符串数组' }
    }
    const normalizedTags: string[] = []
    for (const t of raw.tags) {
      if (typeof t !== 'string') {
        return { ok: false, error: '标签必须是字符串' }
      }
      const trimmed = t.trim()
      if (trimmed.length > 0) {
        normalizedTags.push(trimmed)
      }
    }
    if (normalizedTags.length > 8) {
      return { ok: false, error: '标签数量不能超过 8 个' }
    }
    tags = normalizedTags
  }

  // 分值：可选，默认 5
  let score = 5
  if (raw.score !== null && raw.score !== undefined) {
    if (
      typeof raw.score !== 'number' ||
      !Number.isInteger(raw.score) ||
      raw.score < 1 ||
      raw.score > 100
    ) {
      return { ok: false, error: '分值必须是 1-100 的整数' }
    }
    score = raw.score
  }

  // 解析：可选，≤2000 字符
  let explanation: string | null = null
  if (raw.explanation !== null && raw.explanation !== undefined) {
    if (typeof raw.explanation !== 'string') {
      return { ok: false, error: '解析必须是字符串' }
    }
    if (raw.explanation.length > 2000) {
      return { ok: false, error: '解析不能超过 2000 字符' }
    }
    explanation = raw.explanation
  }

  return {
    ok: true,
    data: { type, title, options, answer, difficulty, tags, score, explanation },
  }
}

/**
 * 校验学生作答的「形状」合法性（只判结构，不判对错）。
 * - 单选：长度 1 的字符串数组，值在 options keys 中
 * - 多选：长度 ≥1 的字符串数组，值都在 options keys 中且无重复
 * - 判断：长度 1 的布尔数组
 * - 填空：字符串数组且长度 = expectedBlankCount（每项可为任意字符串，含空串；
 *   空串视为已作答但判错）。未传 expectedBlankCount 时仅校验为字符串数组。
 */
export function validateObjectiveAnswerShape(
  type: ObjectiveQuestionType,
  answer: unknown,
  options: ObjectiveQuestionOption[] | null,
  expectedBlankCount?: number,
): boolean {
  if (!Array.isArray(answer)) {
    return false
  }
  switch (type) {
    case 'single-choice': {
      if (answer.length !== 1) {
        return false
      }
      const v = answer[0]
      if (typeof v !== 'string') {
        return false
      }
      return (options ?? []).some((o) => o.key === v)
    }
    case 'multiple-choice': {
      if (answer.length < 1) {
        return false
      }
      const keys = (options ?? []).map((o) => o.key)
      const seen = new Set<string>()
      for (const v of answer) {
        if (typeof v !== 'string') {
          return false
        }
        if (!keys.includes(v)) {
          return false
        }
        if (seen.has(v)) {
          return false
        }
        seen.add(v)
      }
      return true
    }
    case 'true-false': {
      return answer.length === 1 && typeof answer[0] === 'boolean'
    }
    case 'fill-blank': {
      if (!answer.every((v) => typeof v === 'string')) {
        return false
      }
      if (expectedBlankCount === undefined) {
        return true
      }
      return answer.length === expectedBlankCount
    }
  }
}
