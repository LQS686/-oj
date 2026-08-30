/**
 * 客观题判分（纯函数，不依赖数据库）
 */
import { normalizeFillBlankAnswer, type ObjectiveAnswer, type ObjectiveQuestionType } from './types'

/**
 * 判定学生作答是否与标准答案一致（判分规则）：
 * - 单选：唯一元素严格相等（字符串严格相等）
 * - 多选：所选键集合与标准答案键集合完全相等（排序后 join 比较；多选/漏选均判错）
 * - 判断：布尔值相等（双方都必须是 boolean）
 * - 填空：逐空用 normalizeFillBlankAnswer（trim + toLowerCase）后精确匹配，
 *   全部空位正确才判对；长度不等直接判错
 */
export function gradeObjectiveAnswer(
  type: ObjectiveQuestionType,
  referenceAnswer: ObjectiveAnswer,
  studentAnswer: ObjectiveAnswer,
): { isCorrect: boolean } {
  switch (type) {
    case 'single-choice': {
      const isCorrect =
        referenceAnswer.length === 1 &&
        studentAnswer.length === 1 &&
        typeof referenceAnswer[0] === 'string' &&
        typeof studentAnswer[0] === 'string' &&
        referenceAnswer[0] === studentAnswer[0]
      return { isCorrect }
    }
    case 'multiple-choice': {
      const reference = [...referenceAnswer].sort().join(',')
      const student = [...studentAnswer].sort().join(',')
      return { isCorrect: reference === student }
    }
    case 'true-false': {
      const isCorrect =
        referenceAnswer.length === 1 &&
        studentAnswer.length === 1 &&
        typeof referenceAnswer[0] === 'boolean' &&
        typeof studentAnswer[0] === 'boolean' &&
        referenceAnswer[0] === studentAnswer[0]
      return { isCorrect }
    }
    case 'fill-blank': {
      if (referenceAnswer.length !== studentAnswer.length) {
        return { isCorrect: false }
      }
      for (let i = 0; i < referenceAnswer.length; i++) {
        const reference = referenceAnswer[i]
        const student = studentAnswer[i]
        if (typeof reference !== 'string' || typeof student !== 'string') {
          return { isCorrect: false }
        }
        if (normalizeFillBlankAnswer(reference) !== normalizeFillBlankAnswer(student)) {
          return { isCorrect: false }
        }
      }
      return { isCorrect: true }
    }
  }
}
