/**
 * lib/markdown/sanitize-schema.ts
 * MarkdownContent 渲染时使用的 rehype-sanitize schema
 *
 * 设计目标：
 *   1. 安全第一：禁止 javascript:/vbscript:/data:/file: 等危险协议，
 *      并禁止 style 属性（hast-util-sanitize 不过滤 style 值，任意 CSS 可注入）
 *   2. 兼容 Hydro/FPS 等导出格式：题面常含 HTML（<h2>/<p>/<span class> 等），
 *      需保留常见展示类标签和属性，否则题面会丢失结构信息
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
 * 重要：
 *   1. 不包含任何 on* 事件处理器属性（onclick/onload/onerror 等），
 *      rehype-sanitize 默认会剥离所有未在白名单中的属性。
 *   2. 不包含 style 属性：hast-util-sanitize 不解析/不过滤 style 值，
 *      任意 CSS 可做 UI 覆盖（如 position:fixed 遮罩）或发起外部请求
 *      （如 background-image:url() 追踪用户），因此统一禁止。
 */
const ALLOWED_ATTRIBUTES_BY_TAG: Record<string, string[]> = {
  // 通用展示属性（color/font-family/font-size/text-align 等由前端 CSS 类控制，
  // 不再放行内 style）
  span: ['className', 'id'],
  div: ['className', 'id', 'align'],
  p: ['className', 'id', 'align'],
  pre: ['className'],
  code: ['className'],
  h1: ['className', 'id'],
  h2: ['className', 'id'],
  h3: ['className', 'id'],
  h4: ['className', 'id'],
  h5: ['className', 'id'],
  h6: ['className', 'id'],
  table: ['className', 'border', 'cellpadding', 'cellspacing', 'align'],
  th: ['className', 'align', 'colspan', 'rowspan'],
  td: ['className', 'align', 'colspan', 'rowspan'],
  font: ['color', 'face', 'size'],
  br: ['clear'],
  img: ['src', 'alt', 'title', 'width', 'height', 'className'],
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
  mtd: ['rowalign', 'columnalign', 'groupalign', 'rowspan', 'columnspan'],
  mspace: ['width', 'height', 'depth', 'linebreak', 'mathbackground', 'mathcolor'],
  mstyle: ['displaystyle', 'scriptlevel', 'mathcolor', 'mathvariant', 'color', 'background', 'fontfamily', 'fontsize'],
  merror: ['mathcolor', 'mathbackground'],
  mfenced: ['open', 'close', 'separators'],
  msqrt: ['className'],
  mroot: ['className'],
  menclose: ['notation', 'notationstyle'],
  mtext: ['mathcolor', 'mathvariant', 'className'],
  mn: ['mathcolor', 'mathvariant', 'className'],
  mo: ['mathcolor', 'mathvariant', 'form', 'fence', 'separator', 'stretchy', 'symmetric', 'maxsize', 'minsize', 'largeop', 'movablelimits', 'accent', 'lspace', 'rspace', 'className'],
  mi: ['mathcolor', 'mathvariant', 'mathsize', 'fontstyle', 'fontweight', 'className'],
  mpadded: ['width', 'height', 'depth', 'lspace', 'voffset', 'className'],
  mphantom: ['className'],
  maction: ['actiontype', 'selection', 'className'],
  mlabeledtr: ['rowalign', 'columnalign', 'groupalign'],
  maligngroup: ['groupalign'],
  malignmark: ['edge', 'className'],
  mglyph: ['src', 'alt', 'width', 'height', 'valign', 'mathbackground'],
}

/**
 * 全局允许的属性（应用于所有标签）
 */
// 注意：hast 中代表 HTML class 属性的字段是 'className'（驼峰），不是 'class'
// 写错会导致 rehype-sanitize 把所有 className 属性剥离（KaTeX 样式全失效）
// style 属性不在此列：hast-util-sanitize 不校验其值（不剥离 url()/expression() 等危险 CSS），
// 允许 style 等于允许任意 CSS 注入（UI 覆盖 / 外部请求），故一律禁止。
const GLOBAL_ALLOWED_ATTRIBUTES = ['className']

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