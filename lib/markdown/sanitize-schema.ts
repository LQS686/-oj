/**
 * lib/markdown/sanitize-schema.ts
 * MarkdownContent 渲染时使用的 rehype-sanitize schema（P3-2 修复：禁止危险协议）
 *
 * 默认 rehype-sanitize schema 允许 data: 与 javascript: 协议；
 * OJ 场景下题解/题目描述可能由 AI 或用户输入，必须禁止可执行 URL。
 */

import { defaultSchema } from 'rehype-sanitize'
import type { Schema } from 'hast-util-sanitize'

const FORBIDDEN_PROTOCOLS = ['javascript', 'vbscript', 'data', 'file']

export const markdownSanitizeSchema: Schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
  },
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto', 'tel', '#'],
    src: ['http', 'https'],
    cite: ['http', 'https'],
  },
  tagNames: [
    ...(defaultSchema.tagNames || []),
    'math',
    'mtext',
    'mn',
    'mo',
    'mi',
    'msup',
    'msub',
    'mfrac',
    'mrow',
    'annotation',
    'semantics',
  ],
  clobberPrefix: 'user-content-',
  clobber: ['name', 'id'],
}

export const FORBIDDEN_URL_PROTOCOLS = FORBIDDEN_PROTOCOLS