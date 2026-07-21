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
  // 数学公式相关 - KaTeX 输出完整的 MathML 标签集
  // rehype-katex 输出 <math> + <semantics> + MathML 子树 + <annotation encoding="application/x-tex">
  // 必须允许全部 MathML 标签，否则块级公式（矩阵、积分、求和等）会被 sanitize 剥离
  // 导致公式回退为原始 LaTeX 文本
  'math', 'semantics', 'annotation', 'mrow', 'mfrac', 'msup', 'msub', 'msubsup',
  'munder', 'mover', 'munderover', 'mtable', 'mtr', 'mtd', 'mtext', 'mn', 'mo', 'mi',
  'mspace', 'mstyle', 'merror', 'mfenced', 'msqrt', 'mroot', 'menclose', 'mlabeledtr',
  'mpadded', 'mphantom', 'maligngroup', 'malignmark', 'mglyph', 'maction',
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
  span: ['style', 'className', 'id'],
  div: ['style', 'className', 'id', 'align'],
  p: ['style', 'className', 'id', 'align'],
  pre: ['style', 'className'],
  code: ['style', 'className'],
  h1: ['style', 'className', 'id'],
  h2: ['style', 'className', 'id'],
  h3: ['style', 'className', 'id'],
  h4: ['style', 'className', 'id'],
  h5: ['style', 'className', 'id'],
  h6: ['style', 'className', 'id'],
  table: ['style', 'className', 'border', 'cellpadding', 'cellspacing', 'align'],
  th: ['style', 'className', 'align', 'colspan', 'rowspan'],
  td: ['style', 'className', 'align', 'colspan', 'rowspan'],
  font: ['color', 'face', 'size'],
  br: ['clear'],
  img: ['src', 'alt', 'title', 'width', 'height', 'style', 'className'],
  a: ['href', 'title', 'target', 'rel'],
  // KaTeX MathML 标签属性：rehype-katex 输出含下列展示属性
  // 缺失会导致 KaTeX 渲染时丢失样式（如颜色、字号、对齐），导致公式变形
  math: ['xmlns', 'display', 'mathcolor', 'mathvariant', 'encoding'],
  annotation: ['encoding', 'name'],
  mfrac: ['linethickness', 'numalign', 'denomalign', 'bevelled'],
  msup: ['scriptlevel', 'mathvariant'],
  msub: ['scriptlevel', 'mathvariant'],
  msubsup: ['scriptlevel', 'mathvariant'],
  munder: ['accentunder', 'align'],
  mover: ['accent', 'align'],
  munderover: ['accentunder', 'accent', 'align'],
  mtable: ['rowspacing', 'columnspacing', 'columnalign', 'rowalign', 'displaystyle', 'align', 'side', 'frame', 'framespacing', 'equalrows', 'equalcolumns', 'minlabelspacing'],
  mtr: ['rowalign', 'columnalign', 'groupalign'],
  mtd: ['rowalign', 'columnalign', 'groupalign', 'rowspan', 'columnspan', 'style'],
  mspace: ['width', 'height', 'depth', 'linebreak', 'mathbackground', 'mathcolor'],
  mstyle: ['displaystyle', 'scriptlevel', 'mathcolor', 'mathvariant', 'color', 'background', 'fontfamily', 'fontsize'],
  merror: ['mathcolor', 'mathbackground'],
  mfenced: ['open', 'close', 'separators'],
  msqrt: ['style', 'className'],
  mroot: ['style', 'className'],
  menclose: ['notation', 'notationstyle'],
  mtext: ['mathcolor', 'mathvariant', 'style', 'className'],
  mn: ['mathcolor', 'mathvariant', 'style', 'className'],
  mo: ['mathcolor', 'mathvariant', 'form', 'fence', 'separator', 'stretchy', 'symmetric', 'maxsize', 'minsize', 'largeop', 'movablelimits', 'accent', 'lspace', 'rspace', 'style', 'className'],
  mi: ['mathcolor', 'mathvariant', 'mathsize', 'fontstyle', 'fontweight', 'style', 'className'],
  mpadded: ['width', 'height', 'depth', 'lspace', 'voffset', 'style', 'className'],
  mphantom: ['style', 'className'],
  maction: ['actiontype', 'selection', 'style', 'className'],
  mlabeledtr: ['rowalign', 'columnalign', 'groupalign'],
  maligngroup: ['groupalign'],
  malignmark: ['edge', 'style', 'className'],
  mglyph: ['src', 'alt', 'width', 'height', 'valign', 'mathbackground'],
}

/**
 * 全局允许的属性（应用于所有标签）
 */
// 注意：hast 中代表 HTML class 属性的字段是 'className'（驼峰），不是 'class'
// 写错会导致 rehype-sanitize 把所有 className 属性剥离（KaTeX 样式全失效）
const GLOBAL_ALLOWED_ATTRIBUTES = ['style', 'className']

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