/**
 * tests/markdown-plain-text.test.ts
 * Markdown → 单行纯文本（lib/markdown/plain-text.ts）回归测试。
 *
 * 覆盖曾出现的真实 bug：公告列表预览直接输出 markdown 原文，
 * 把 `##`、`**` 等标记暴露给用户（曾显示为「## 欢迎 平台已上线题库…」）。
 */
import { describe, it, expect } from 'vitest'
import { markdownToPlainText } from '@/lib/markdown/plain-text'

describe('markdownToPlainText：块级标记', () => {
  it('去掉标题的 # 号', () => {
    expect(markdownToPlainText('## 欢迎')).toBe('欢迎')
  })

  it('多级标题都去掉', () => {
    expect(markdownToPlainText('# 一级\n### 三级')).toBe('一级 三级')
  })

  it('去掉引用与无序列表标记', () => {
    expect(markdownToPlainText('> 引用\n- 一\n- 二')).toBe('引用 一 二')
  })

  it('有序列表去掉序号', () => {
    expect(markdownToPlainText('1. 第一步\n2. 第二步')).toBe('第一步 第二步')
  })

  it('去掉分隔线', () => {
    expect(markdownToPlainText('上文\n---\n下文')).toBe('上文 下文')
  })
})

describe('markdownToPlainText：行内标记', () => {
  it('去掉粗体与斜体', () => {
    expect(markdownToPlainText('**重点**与*强调*')).toBe('重点与强调')
  })

  it('链接只保留文字', () => {
    expect(markdownToPlainText('见[题库](/problems)')).toBe('见题库')
  })

  it('图片只保留 alt', () => {
    expect(markdownToPlainText('![封面](/a.png)')).toBe('封面')
  })

  it('行内代码去掉反引号', () => {
    expect(markdownToPlainText('运行 `npm run dev`')).toBe('运行 npm run dev')
  })

  it('围栏代码块整体丢弃', () => {
    expect(markdownToPlainText('前\n```js\nconst a = 1\n```\n后')).toBe('前 后')
  })
})

describe('markdownToPlainText：公式不可被强调规则误伤', () => {
  it('单个下标保留', () => {
    expect(markdownToPlainText('求 $a_i$ 的值')).toBe('求 a_i 的值')
  })

  it('公式里的多个下划线不会被当成斜体而吃掉内容', () => {
    expect(markdownToPlainText('计算 $a_i + b_j$ 的和')).toBe('计算 a_i + b_j 的和')
  })

  it('块级公式保留内容', () => {
    expect(markdownToPlainText('$$\n\\sum_{i=1}^{n} a_i\n$$')).toBe('\\sum_{i=1}^{n} a_i')
  })
})

describe('markdownToPlainText：折叠与截断', () => {
  it('连续空行折叠为单个空格', () => {
    expect(markdownToPlainText('一\n\n二\n\n\n三')).toBe('一 二 三')
  })

  it('空输入返回空串', () => {
    expect(markdownToPlainText('')).toBe('')
  })

  it('超长内容截断并加省略号', () => {
    expect(markdownToPlainText('啊'.repeat(300), 10)).toBe(`${'啊'.repeat(10)}…`)
  })

  it('未超长内容不加省略号', () => {
    expect(markdownToPlainText('短内容', 10)).toBe('短内容')
  })

  it('真实公告预览不再暴露 markdown 标记', () => {
    const content = '## 欢迎\n平台已上线**题库**功能，详见[使用帮助](/help)。'
    expect(markdownToPlainText(content)).toBe('欢迎 平台已上线题库功能，详见使用帮助。')
  })
})
