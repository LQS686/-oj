import { describe, it, expect, vi } from 'vitest'

// 屏蔽 logger 的副作用（动态 import fs + 创建 logs 目录 + 导入 next/server），
// 保证本文件为纯逻辑测试。safeJsonParse 失败路径仅调用 logger.warn。
vi.mock('@/lib/logger', () => ({
  logger: {
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}))

import {
  safeJsonParse,
  stripThinkBlocks,
  tryRemoveMarkdown,
  tryDirectParse,
} from '@/lib/ai/response-parser'

describe('safeJsonParse - 正常 JSON', () => {
  it('普通对象', () => {
    expect(safeJsonParse('{"a": 1, "b": [1, 2, 3]}')).toEqual({ a: 1, b: [1, 2, 3] })
  })

  it('完整题目结构', () => {
    expect(
      safeJsonParse('{"problems": [{"title": "台阶问题", "difficulty": "普及", "tags": ["DP"]}]}'),
    ).toEqual({ problems: [{ title: '台阶问题', difficulty: '普及', tags: ['DP'] }] })
  })

  it('嵌套对象 / 数组', () => {
    expect(safeJsonParse('{"a":{"b":{"c":[1,2,[3,4]]}}}')).toEqual({
      a: { b: { c: [1, 2, [3, 4]] } },
    })
  })

  it('顶层数组', () => {
    expect(safeJsonParse('[1, 2, 3, [4, 5], {"x": 1}]')).toEqual([1, 2, 3, [4, 5], { x: 1 }])
  })

  it('数字 / 布尔 / null 类型', () => {
    expect(safeJsonParse('{"num": 42, "bool": true, "nothing": null, "arr": [1, 2, 3]}')).toEqual({
      num: 42,
      bool: true,
      nothing: null,
      arr: [1, 2, 3],
    })
  })

  it('中文 + Unicode 转义', () => {
    expect(safeJsonParse('{"title": "\\u4e2d\\u6587\\u6807\\u9898", "desc": "中文描述"}')).toEqual({
      title: '中文标题',
      desc: '中文描述',
    })
  })
})

describe('safeJsonParse - markdown 包裹（修复后应能解析）', () => {
  it('```json ... ``` 应能解析', () => {
    expect(safeJsonParse('```json\n{"a": 1}\n```')).toEqual({ a: 1 })
  })

  it('裸 ``` ... ``` 应能解析', () => {
    expect(safeJsonParse('```\n{"a": 1}\n```')).toEqual({ a: 1 })
  })

  it('think 块 + markdown 代码块组合 → 正确解析', () => {
    expect(safeJsonParse('<think>我先想好...</think>\n```json\n{"a": 1}\n```')).toEqual({ a: 1 })
  })
})

describe('safeJsonParse - think 块', () => {
  it('<think>...</think> 包裹有效 JSON → 正确解析', () => {
    expect(
      safeJsonParse('<think>\n用户想要一道动态规划题\n</think>\n{"problems": [{"title": "台阶问题", "difficulty": "普及"}]}'),
    ).toEqual({ problems: [{ title: '台阶问题', difficulty: '普及' }] })
  })

  it('think 块内含 JSON 示例（非贪婪剥离）→ 解析块外 JSON', () => {
    expect(safeJsonParse('<think>这里我想：{"foo": 1} 合适吗？</think>{"answer": 42}')).toEqual({
      answer: 42,
    })
  })

  it('多个独立 think 块 → 全部剥离', () => {
    expect(safeJsonParse('<think>a</think>{"x": 1}<think>b</think>')).toEqual({ x: 1 })
  })

  it('JSON 字符串内含 "think" 字面量（非块）→ 正常解析', () => {
    expect(safeJsonParse('{"text": "这里有个 think 但不是块", "value": 42}')).toEqual({
      text: '这里有个 think 但不是块',
      value: 42,
    })
  })
})

describe('safeJsonParse - 截断 / 非法输入', () => {
  it('截断的 JSON → 抛 AI_PARSE_FAILED 且 hint 含"截断"', () => {
    let thrown: any
    try {
      safeJsonParse('{"title": "最大矩形", "desc": "...", "outpu')
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeDefined()
    expect(thrown.code).toBe('AI_PARSE_FAILED')
    expect(thrown.info?.hint).toContain('截断')
  })

  it('未闭合花括号 → 抛 AI_PARSE_FAILED', () => {
    expect(() => safeJsonParse('{"a": 1, "b": {"c": 2')).toThrow()
    let thrown: any
    try {
      safeJsonParse('{"a": 1, "b": {"c": 2')
    } catch (e) {
      thrown = e
    }
    expect(thrown.code).toBe('AI_PARSE_FAILED')
  })

  it('空字符串 → 抛 AI_PARSE_FAILED', () => {
    expect(() => safeJsonParse('')).toThrow()
    let thrown: any
    try {
      safeJsonParse('')
    } catch (e) {
      thrown = e
    }
    expect(thrown.code).toBe('AI_PARSE_FAILED')
  })

  it('纯空白 → 抛 AI_PARSE_FAILED', () => {
    expect(() => safeJsonParse('   \n\t  ')).toThrow()
  })

  it('非 JSON 文本 → 抛 AI_PARSE_FAILED', () => {
    expect(() => safeJsonParse('hello world')).toThrow()
    let thrown: any
    try {
      safeJsonParse('hello world')
    } catch (e) {
      thrown = e
    }
    expect(thrown.code).toBe('AI_PARSE_FAILED')
  })

  it('缺逗号的非法 JSON → 抛 AI_PARSE_FAILED', () => {
    expect(() => safeJsonParse('[{"a": 1}{"b": 2}]')).toThrow()
  })
})

describe('stripThinkBlocks', () => {
  it('剥离单个 think 块', () => {
    expect(stripThinkBlocks('<think>thinking</think>{"a": 1}')).toBe('{"a": 1}')
  })

  it('非贪婪剥离多个 think 块（保留中间正文）', () => {
    expect(stripThinkBlocks('<think>A</think>正文<think>B</think>')).toBe('正文')
  })

  it('大小写不敏感', () => {
    expect(stripThinkBlocks('<THINK>a</THINK>hello')).toBe('hello')
  })

  it('空字符串 → 空字符串', () => {
    expect(stripThinkBlocks('')).toBe('')
  })

  it('无 think 块 → 原样返回（trim）', () => {
    expect(stripThinkBlocks('{"a": 1}')).toBe('{"a": 1}')
  })

  it('think 块内含 JSON 字面量（非贪婪，只删 think 块）', () => {
    expect(stripThinkBlocks('<think>{"foo": 1}</think>{"answer": 42}')).toBe('{"answer": 42}')
  })
})

describe('tryRemoveMarkdown', () => {
  it('剥离 ```json fence', () => {
    expect(tryRemoveMarkdown('```json\n{"a": 1}\n```')).toEqual({ a: 1 })
  })

  it('剥离裸 ``` fence', () => {
    expect(tryRemoveMarkdown('```\n{"a": 1}\n```')).toEqual({ a: 1 })
  })

  it('无 fence → 直接解析', () => {
    expect(tryRemoveMarkdown('{"a": 1}')).toEqual({ a: 1 })
  })

  it('非法 JSON → 抛错', () => {
    expect(() => tryRemoveMarkdown('```json\n{invalid')).toThrow()
  })
})

describe('tryDirectParse', () => {
  it('合法 JSON → 解析', () => {
    expect(tryDirectParse('{"a": 1}')).toEqual({ a: 1 })
  })

  it('非法 JSON → 抛错', () => {
    expect(() => tryDirectParse('{invalid')).toThrow()
  })
})
