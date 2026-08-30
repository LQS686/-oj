import { describe, it, expect } from 'vitest'
import { gradeObjectiveAnswer } from '@/lib/objective-question/grading'
import {
  validateObjectiveAnswerShape,
  validateObjectiveQuestionPayload,
} from '@/lib/objective-question/validation'
import type { ObjectiveQuestionOption } from '@/lib/objective-question/types'

const CHOICE_OPTIONS: ObjectiveQuestionOption[] = [
  { key: 'A', content: '选项 A' },
  { key: 'B', content: '选项 B' },
  { key: 'C', content: '选项 C' },
  { key: 'D', content: '选项 D' },
]

function validSingleChoicePayload() {
  return {
    type: 'single-choice',
    title: '  下列哪项是正确答案？  ',
    options: [
      { key: 'A', content: ' 错误选项 ' },
      { key: 'B', content: '正确选项' },
    ],
    answer: ['B'],
    difficulty: '中等',
    tags: [' 代数 ', '', '方程'],
    score: 10,
    explanation: '因为 B 正确',
  }
}

describe('gradeObjectiveAnswer - 单选题', () => {
  it('相同键 → 正确', () => {
    expect(gradeObjectiveAnswer('single-choice', ['B'], ['B']).isCorrect).toBe(true)
  })

  it('不同键 → 错误', () => {
    expect(gradeObjectiveAnswer('single-choice', ['B'], ['A']).isCorrect).toBe(false)
  })
})

describe('gradeObjectiveAnswer - 多选题', () => {
  it('集合相同顺序不同 → 正确', () => {
    expect(gradeObjectiveAnswer('multiple-choice', ['A', 'C'], ['C', 'A']).isCorrect).toBe(true)
  })

  it('漏选判错（["A"] vs ["A","C"]）', () => {
    expect(gradeObjectiveAnswer('multiple-choice', ['A', 'C'], ['A']).isCorrect).toBe(false)
  })

  it('多选判错（["A","B","C"] vs ["A","C"]）', () => {
    expect(gradeObjectiveAnswer('multiple-choice', ['A', 'C'], ['A', 'B', 'C']).isCorrect).toBe(
      false,
    )
  })
})

describe('gradeObjectiveAnswer - 判断题', () => {
  it('true vs true → 正确', () => {
    expect(gradeObjectiveAnswer('true-false', [true], [true]).isCorrect).toBe(true)
  })

  it('true vs false → 错误', () => {
    expect(gradeObjectiveAnswer('true-false', [true], [false]).isCorrect).toBe(false)
  })

  it('false vs false → 正确', () => {
    expect(gradeObjectiveAnswer('true-false', [false], [false]).isCorrect).toBe(true)
  })
})

describe('gradeObjectiveAnswer - 填空题', () => {
  it('完全正确', () => {
    expect(gradeObjectiveAnswer('fill-blank', ['Hello', 'World'], ['Hello', 'World']).isCorrect).toBe(
      true,
    )
  })

  it('大小写不敏感（["Hello"] vs ["hello"]）→ 正确', () => {
    expect(gradeObjectiveAnswer('fill-blank', ['Hello'], ['hello']).isCorrect).toBe(true)
  })

  it('首尾空白容忍（["Hello"] vs ["  Hello  "]）→ 正确', () => {
    expect(gradeObjectiveAnswer('fill-blank', ['Hello'], ['  Hello  ']).isCorrect).toBe(true)
  })

  it('大小写 + 空白组合（["Hello"] vs [" hello "]）→ 正确', () => {
    expect(gradeObjectiveAnswer('fill-blank', ['Hello'], [' hello ']).isCorrect).toBe(true)
  })

  it('部分空位错误 → 判错', () => {
    expect(gradeObjectiveAnswer('fill-blank', ['A', 'B'], ['A', 'C']).isCorrect).toBe(false)
  })

  it('空位数不匹配（长度不等）→ 判错', () => {
    expect(gradeObjectiveAnswer('fill-blank', ['A', 'B'], ['A']).isCorrect).toBe(false)
  })

  it('中文答案：完全一致 → 正确', () => {
    expect(gradeObjectiveAnswer('fill-blank', ['北京', '上海'], ['北京', '上海']).isCorrect).toBe(
      true,
    )
  })

  it('中文答案：不一致 → 判错', () => {
    expect(gradeObjectiveAnswer('fill-blank', ['北京'], ['上海']).isCorrect).toBe(false)
  })

  it('中文答案：trim 后一致 → 正确', () => {
    expect(gradeObjectiveAnswer('fill-blank', ['中华人民共和国'], [' 中华人民共和国 ']).isCorrect).toBe(
      true,
    )
  })
})

describe('validateObjectiveQuestionPayload - 合法载荷', () => {
  it('合法单选载荷 → ok，且返回规范化数据', () => {
    const r = validateObjectiveQuestionPayload(validSingleChoicePayload())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.type).toBe('single-choice')
    // title trim
    expect(r.data.title).toBe('下列哪项是正确答案？')
    // options 规范化（content trim）
    expect(r.data.options).toEqual([
      { key: 'A', content: '错误选项' },
      { key: 'B', content: '正确选项' },
    ])
    expect(r.data.answer).toEqual(['B'])
    expect(r.data.difficulty).toBe('中等')
    // tags 规范化：trim + 剔除空项
    expect(r.data.tags).toEqual(['代数', '方程'])
    expect(r.data.score).toBe(10)
    expect(r.data.explanation).toBe('因为 B 正确')
  })

  it('合法多选载荷 → ok，answer 排序去重规范化', () => {
    const r = validateObjectiveQuestionPayload({
      type: 'multiple-choice',
      title: '多选题题干',
      options: CHOICE_OPTIONS,
      answer: ['C', 'A'],
      difficulty: '困难',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.answer).toEqual(['A', 'C'])
    // 未传 score/tags/explanation 时取默认值
    expect(r.data.score).toBe(5)
    expect(r.data.tags).toEqual([])
    expect(r.data.explanation).toBeNull()
  })

  it('合法判断题载荷 → ok，options 为 null', () => {
    const r = validateObjectiveQuestionPayload({
      type: 'true-false',
      title: '1+1=2',
      options: null,
      answer: [true],
      difficulty: '简单',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.options).toBeNull()
    expect(r.data.answer).toEqual([true])
  })

  it('合法填空题载荷 → ok，答案数与空位数一致', () => {
    const r = validateObjectiveQuestionPayload({
      type: 'fill-blank',
      title: '中国的首都是____，最大城市是____。',
      options: null,
      answer: ['北京', '上海'],
      difficulty: '简单',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.answer).toEqual(['北京', '上海'])
  })
})

describe('validateObjectiveQuestionPayload - 非法载荷', () => {
  it('单选答案不在选项中 → 失败', () => {
    const payload = { ...validSingleChoicePayload(), answer: ['E'] }
    const r = validateObjectiveQuestionPayload(payload)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toBe('单选题答案必须是选项之一')
  })

  it('多选答案重复 → 失败', () => {
    const r = validateObjectiveQuestionPayload({
      type: 'multiple-choice',
      title: '多选题题干',
      options: CHOICE_OPTIONS,
      answer: ['A', 'A'],
      difficulty: '中等',
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toBe('多选题答案不能重复')
  })

  it('填空题题干无空位标记 → 失败', () => {
    const r = validateObjectiveQuestionPayload({
      type: 'fill-blank',
      title: '这道题没有空位',
      answer: ['北京'],
      difficulty: '简单',
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toContain('空位')
  })

  it('填空答案数与空位数不符 → 失败', () => {
    const r = validateObjectiveQuestionPayload({
      type: 'fill-blank',
      title: '中国的首都是____，最大城市是____。',
      answer: ['北京'],
      difficulty: '简单',
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toContain('空位数')
  })

  it('题干超长（>2000 字符）→ 失败', () => {
    const payload = validSingleChoicePayload()
    payload.title = '题'.repeat(2001)
    const r = validateObjectiveQuestionPayload(payload)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toContain('2000')
  })

  it('题干为空白 → 失败', () => {
    const payload = validSingleChoicePayload()
    payload.title = '   '
    const r = validateObjectiveQuestionPayload(payload)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toBe('题干不能为空')
  })

  it('难度非法 → 失败', () => {
    const payload = validSingleChoicePayload()
    ;(payload as Record<string, unknown>).difficulty = '超难'
    const r = validateObjectiveQuestionPayload(payload)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toContain('难度')
  })

  it('选择题 options 少于 2 项 → 失败', () => {
    const payload = validSingleChoicePayload()
    payload.options = [{ key: 'A', content: '唯一选项' }]
    const r = validateObjectiveQuestionPayload(payload)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toContain('2-8')
  })

  it('选项 key 非大写字母 → 失败', () => {
    const payload = validSingleChoicePayload()
    payload.options = [
      { key: 'a', content: '选项一' },
      { key: 'b', content: '选项二' },
    ]
    const r = validateObjectiveQuestionPayload(payload)
    expect(r.ok).toBe(false)
  })

  it('选项内容为空 → 失败', () => {
    const payload = validSingleChoicePayload()
    payload.options = [
      { key: 'A', content: '  ' },
      { key: 'B', content: '选项二' },
    ]
    const r = validateObjectiveQuestionPayload(payload)
    expect(r.ok).toBe(false)
  })

  it('判断题携带 options → 失败', () => {
    const r = validateObjectiveQuestionPayload({
      type: 'true-false',
      title: '1+1=2',
      options: CHOICE_OPTIONS,
      answer: [true],
      difficulty: '简单',
    })
    expect(r.ok).toBe(false)
  })

  it('题型非法 → 失败', () => {
    const payload = validSingleChoicePayload()
    ;(payload as Record<string, unknown>).type = 'essay'
    const r = validateObjectiveQuestionPayload(payload)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toBe('题型不合法')
  })

  it('分值非法（非整数 / 超范围）→ 失败', () => {
    const p1 = { ...validSingleChoicePayload(), score: 0 }
    expect(validateObjectiveQuestionPayload(p1).ok).toBe(false)
    const p2 = { ...validSingleChoicePayload(), score: 101 }
    expect(validateObjectiveQuestionPayload(p2).ok).toBe(false)
    const p3 = { ...validSingleChoicePayload(), score: 5.5 }
    expect(validateObjectiveQuestionPayload(p3).ok).toBe(false)
  })

  it('标签超过 8 个 → 失败', () => {
    const payload = validSingleChoicePayload()
    payload.tags = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
    const r = validateObjectiveQuestionPayload(payload)
    expect(r.ok).toBe(false)
  })
})

describe('validateObjectiveAnswerShape - 单选题', () => {
  it('合法：长度 1 且值在选项中', () => {
    expect(validateObjectiveAnswerShape('single-choice', ['A'], CHOICE_OPTIONS)).toBe(true)
    expect(validateObjectiveAnswerShape('single-choice', ['D'], CHOICE_OPTIONS)).toBe(true)
  })

  it('非法：长度不为 1', () => {
    expect(validateObjectiveAnswerShape('single-choice', [], CHOICE_OPTIONS)).toBe(false)
    expect(validateObjectiveAnswerShape('single-choice', ['A', 'B'], CHOICE_OPTIONS)).toBe(false)
  })

  it('非法：值不在选项 keys 中', () => {
    expect(validateObjectiveAnswerShape('single-choice', ['E'], CHOICE_OPTIONS)).toBe(false)
    expect(validateObjectiveAnswerShape('single-choice', ['a'], CHOICE_OPTIONS)).toBe(false)
  })

  it('非法：非字符串元素', () => {
    expect(validateObjectiveAnswerShape('single-choice', [true], CHOICE_OPTIONS)).toBe(false)
  })

  it('非法：非数组', () => {
    expect(validateObjectiveAnswerShape('single-choice', 'A', CHOICE_OPTIONS)).toBe(false)
  })
})

describe('validateObjectiveAnswerShape - 多选题', () => {
  it('合法：≥1 个键且都在选项中、无重复', () => {
    expect(validateObjectiveAnswerShape('multiple-choice', ['A'], CHOICE_OPTIONS)).toBe(true)
    expect(validateObjectiveAnswerShape('multiple-choice', ['C', 'A'], CHOICE_OPTIONS)).toBe(true)
  })

  it('非法：空数组', () => {
    expect(validateObjectiveAnswerShape('multiple-choice', [], CHOICE_OPTIONS)).toBe(false)
  })

  it('非法：含不在选项中的键', () => {
    expect(validateObjectiveAnswerShape('multiple-choice', ['A', 'E'], CHOICE_OPTIONS)).toBe(false)
  })

  it('非法：重复键', () => {
    expect(validateObjectiveAnswerShape('multiple-choice', ['A', 'A'], CHOICE_OPTIONS)).toBe(false)
  })

  it('非法：非字符串元素', () => {
    expect(validateObjectiveAnswerShape('multiple-choice', ['A', false], CHOICE_OPTIONS)).toBe(false)
  })
})

describe('validateObjectiveAnswerShape - 判断题', () => {
  it('合法：长度 1 的布尔数组', () => {
    expect(validateObjectiveAnswerShape('true-false', [true], null)).toBe(true)
    expect(validateObjectiveAnswerShape('true-false', [false], null)).toBe(true)
  })

  it('非法：非布尔值', () => {
    expect(validateObjectiveAnswerShape('true-false', ['true'], null)).toBe(false)
    expect(validateObjectiveAnswerShape('true-false', [1], null)).toBe(false)
  })

  it('非法：长度不为 1', () => {
    expect(validateObjectiveAnswerShape('true-false', [], null)).toBe(false)
    expect(validateObjectiveAnswerShape('true-false', [true, false], null)).toBe(false)
  })
})

describe('validateObjectiveAnswerShape - 填空题', () => {
  it('合法：字符串数组且长度 = 空位数', () => {
    expect(validateObjectiveAnswerShape('fill-blank', ['北京'], null, 1)).toBe(true)
    expect(validateObjectiveAnswerShape('fill-blank', ['北京', '上海'], null, 2)).toBe(true)
  })

  it('合法：空串视为已作答（形状合法，判分时判错）', () => {
    expect(validateObjectiveAnswerShape('fill-blank', [''], null, 1)).toBe(true)
    expect(validateObjectiveAnswerShape('fill-blank', ['', '上海'], null, 2)).toBe(true)
  })

  it('非法：长度与空位数不符', () => {
    expect(validateObjectiveAnswerShape('fill-blank', ['北京', '上海'], null, 1)).toBe(false)
    expect(validateObjectiveAnswerShape('fill-blank', [], null, 1)).toBe(false)
  })

  it('非法：非字符串元素', () => {
    expect(validateObjectiveAnswerShape('fill-blank', [true], null, 1)).toBe(false)
  })

  it('非法：非数组', () => {
    expect(validateObjectiveAnswerShape('fill-blank', '北京', null, 1)).toBe(false)
  })
})
