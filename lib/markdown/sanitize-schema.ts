/**
 * lib/markdown/sanitize-schema.ts
 * MarkdownContent 渲染时使用的 rehype-sanitize schema
 *
 * 设计目标：
 *   1. 安全第一：禁止 javascript:/vbscript:/data:/file: 等危险协议
 *   2. 兼容 Hydro/FPS 等导出格式：题面常含 HTML（<h2>/<p>/<span style> 等），
 *      需保留常见展示类标签和属性，否则题面会丢失样式信息
 *   3. 仍禁止所有事件处理器（onclick、onload 等）和脚本标签
 */

import { defaultSchema } from 'rehype-sanitize'
import type { Schema } from 'hast-util-sanitize'

const FORBIDDEN_PROTOCOLS = ['javascript', 'vbscript', 'data', 'file']

/**
 * 题面 HTML 中允许的常见展示类标签
 * （在 defaultSchema 基础上补充，defaultSchema 已包含 p/h1-h6/ul/ol/li/pre/code 等）
 */
const EXTRA_ALLOWED_TAGS = [
  // 数学公式相关
  'math', 'mtext', 'mn', 'mo', 'mi', 'msup', 'msub', 'mfrac', 'mrow', 'annotation', 'semantics',
  // Hydro 导出题面常见标签
  'span', 'div', 'br', 'hr', 'sub', 'sup', 'small', 's', 'u',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  'font', 'center', 'strong', 'em', 'b', 'i',
]

/**
 * 允许的 HTML 属性白名单（按标签分组）
 *
 * 重要：不包含任何 on* 事件处理器属性（onclick/onload/onerror 等），
 *       rehype-sanitize 默认会剥离所有未在白名单中的属性。
 */
const ALLOWED_ATTRIBUTES_BY_TAG: Record<string, string[]> = {
  // 通用展示属性（color/font-family/font-size/text-align 等）
  // 注：style 属性经过 rehype-sanitize 内置 css 过滤，会剥离 url()、expression() 等危险 CSS
  span: ['style', 'class', 'id'],
  div: ['style', 'class', 'id', 'align'],
  p: ['style', 'class', 'id', 'align'],
  pre: ['style', 'class'],
  code: ['style', 'class'],
  h1: ['style', 'class', 'id'],
  h2: ['style', 'class', 'id'],
  h3: ['style', 'class', 'id'],
  h4: ['style', 'class', 'id'],
  h5: ['style', 'class', 'id'],
  h6: ['style', 'class', 'id'],
  table: ['style', 'class', 'border', 'cellpadding', 'cellspacing', 'align'],
  th: ['style', 'class', 'align', 'colspan', 'rowspan'],
  td: ['style', 'class', 'align', 'colspan', 'rowspan'],
  font: ['color', 'face', 'size'],
  br: ['clear'],
  img: ['src', 'alt', 'title', 'width', 'height', 'style', 'class'],
  a: ['href', 'title', 'target', 'rel'],
}

/**
 * 全局允许的属性（应用于所有标签）
 */
const GLOBAL_ALLOWED_ATTRIBUTES = ['style', 'class']

export const markdownSanitizeSchema: Schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    // 为每个白名单标签补充允许的属性
    ...Object.fromEntries(
      Object.entries(ALLOWED_ATTRIBUTES_BY_TAG).map(([tag, attrs]) => [
        tag,
        // 与 defaultSchema 中已有的属性取并集
        Array.from(new Set([
          ...((defaultSchema.attributes?.[tag] as string[]) || []),
          ...attrs,
          ...GLOBAL_ALLOWED_ATTRIBUTES,
        ])),
      ])
    ),
    // 所有标签的全局允许属性
    '*': GLOBAL_ALLOWED_ATTRIBUTES,
  },
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto', 'tel', '#'],
    src: ['http', 'https'],
    cite: ['http', 'https'],
  },
  tagNames: [
    ...(defaultSchema.tagNames || []),
    ...EXTRA_ALLOWED_TAGS,
  ],
  // 防止 id 属性造成 clobber 攻击（如 id="content" 覆盖 document.content）
  clobberPrefix: 'user-content-',
  clobber: ['name', 'id'],
}

export const FORBIDDEN_URL_PROTOCOLS = FORBIDDEN_PROTOCOLS