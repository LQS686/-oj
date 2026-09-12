/**
 * Markdown → 单行纯文本（lib/markdown/plain-text.ts）
 *
 * 用途：列表页的摘要预览。
 *
 * 为什么需要它：列表里直接渲染 markdown 原文会把标记符号暴露给用户
 * （公告预览曾显示成「## 欢迎 平台已上线题库…」）。列表只需一段可读摘要，
 * 不需要完整渲染；需要真正渲染请用 components/common/MarkdownRenderer。
 *
 * 只做「去标记」，不做 HTML 解析：预览是纯文本，天然无 XSS 风险。
 */

/** 公式占位符：公式内容先取出，避免其中的 _ 被误判为斜体标记。
 *  用 Unicode 私用区字符（非控制字符，避免触发 no-control-regex）。 */
const MATH_OPEN = '\uE000'
const MATH_CLOSE = '\uE001'
const MATH_TOKEN = /\uE000MATH(\d+)\uE001/g

export function markdownToPlainText(markdown: string, maxLength = 200): string {
  if (!markdown) return ''

  // 1. 先把数学公式整体取出（否则 `a_i + b_j` 里的下划线会被当成斜体标记而吃掉内容）
  const mathSegments: string[] = []
  const stash = (_match: string, body: string) => {
    mathSegments.push(body)
    return `${MATH_OPEN}MATH${mathSegments.length - 1}${MATH_CLOSE}`
  }

  let text = markdown
    .replace(/\$\$([\s\S]*?)\$\$/g, stash)
    .replace(/\$([^$\n]+)\$/g, stash)
    // 2. 代码：围栏块整体丢弃，行内代码保留内容
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    // 3. 图片与链接：只保留可读文本
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // 4. 块级标记（按行处理，需在折叠空白之前）
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '')
    .replace(/^[ \t]{0,3}>[ \t]?/gm, '')
    .replace(/^[ \t]{0,3}(?:[-*+]|\d+\.)[ \t]+/gm, '')
    .replace(/^[ \t]{0,3}(?:[-*_][ \t]*){3,}$/gm, ' ')
    // 5. 强调
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    // 6. 折叠所有空白（含换行）为单个空格
    .replace(/\s+/g, ' ')
    // 7. 放回公式内容
    .replace(MATH_TOKEN, (_match, index: string) => mathSegments[Number(index)] ?? '')
    .trim()

  if (text.length > maxLength) {
    text = `${text.slice(0, maxLength)}…`
  }
  return text
}
