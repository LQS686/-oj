/**
 * 本地 ESLint 规则：把 UI 设计规矩固化为静态检查。
 *
 * 配套约定见：
 *   - components/layout/PageShell.tsx 顶部注释（每页恰好一个 H1、宽度只能取语义 token）
 *   - app/globals.css 的 @theme inline（颜色 / 圆角 / 标题字号 token）
 *
 * 为什么需要这些规则：第 1 步「立规矩」修复的问题（同一页面出现两个标题、
 * H1 视觉隐藏、裸色值与任意圆角四处扩散）都是**约定没被强制**导致的，
 * 只靠人自觉必然再次分叉。
 */

const HEX_COLOR = /#[0-9A-Fa-f]{3,8}\b/
const ARBITRARY_HEX_CLASS = /\[#[0-9A-Fa-f]{3,8}\]/
const ARBITRARY_RADIUS_CLASS = /rounded-\[/
/** 独立成词的 hidden（排除 overflow-hidden 这类复合类名） */
const HIDDEN_CLASS = /(^|\s)([a-z]+:)?hidden(\s|$)/

/** 会自行渲染页面唯一 H1 的外壳组件 */
const PAGE_SHELL_NAMES = new Set(['PageShell', 'EducationalPageShell', 'ClassWorkspaceShell'])

const COLOR_STYLE_PROPS = new Set([
  'color',
  'background',
  'backgroundColor',
  'borderColor',
  'borderTopColor',
  'borderBottomColor',
  'borderLeftColor',
  'borderRightColor',
  'outlineColor',
  'fill',
  'stroke',
  'boxShadow',
  'textDecorationColor',
])

function stringAttrValue(attr) {
  const v = attr.value
  if (!v) return ''
  if (v.type === 'Literal') return typeof v.value === 'string' ? v.value : ''
  if (v.type === 'JSXExpressionContainer' && v.expression?.type === 'Literal') {
    return typeof v.expression.value === 'string' ? v.expression.value : ''
  }
  return ''
}

/**
 * 使用了页面外壳的文件不得再自写 <h1>。
 *
 * 不对「每文件一个 H1」做限制：登录/找回密码等页面在不同状态分支里各有一个 H1
 * （互斥渲染）是正确写法。真正出过问题的是「外壳已渲染标题、页面又写一个」，
 * 那会让同一屏出现两个同名标题——本规则正是拦这一类。
 */
const noH1WithPageShell = {
  meta: {
    type: 'problem',
    docs: {
      description:
        '使用页面外壳（PageShell / EducationalPageShell / ClassWorkspaceShell）的文件不得自写 <h1>',
    },
    schema: [],
    messages: {
      withShell:
        '本文件使用了页面外壳 {{shell}}，它会渲染页面唯一的 <h1>。请把标题交给外壳的 title 属性，不要在页面里再写 <h1>，否则同一屏会出现两个标题。',
      hidden:
        '<h1> 不得用 hidden 类做视觉隐藏（display:none 会同时把标题移出无障碍树）。确需隐藏请用 sr-only，或直接用外壳的 visuallyHiddenTitle。',
    },
  },
  create(context) {
    let shellName = null
    const h1Nodes = []

    return {
      ImportDeclaration(node) {
        const from = node.source?.value
        if (typeof from !== 'string') return
        for (const spec of node.specifiers) {
          const imported = spec.imported?.name ?? spec.local?.name
          if (imported && PAGE_SHELL_NAMES.has(imported)) shellName = imported
        }
      },
      JSXOpeningElement(node) {
        if (node.name?.type !== 'JSXIdentifier' || node.name.name !== 'h1') return
        h1Nodes.push(node)

        for (const attr of node.attributes) {
          if (attr.type !== 'JSXAttribute' || attr.name?.name !== 'className') continue
          const text = stringAttrValue(attr)
          if (text && HIDDEN_CLASS.test(text)) {
            context.report({ node, messageId: 'hidden' })
          }
        }
      },
      'Program:exit'() {
        if (!shellName) return
        for (const node of h1Nodes) {
          context.report({ node, messageId: 'withShell', data: { shell: shellName } })
        }
      },
    }
  },
}

/** 禁止 Tailwind 任意值里写裸色值与任意圆角 */
const noArbitraryDesignValues = {
  meta: {
    type: 'problem',
    docs: { description: '禁止在 class 中使用裸色值（[#rrggbb]）与任意圆角（rounded-[...]）' },
    schema: [],
    messages: {
      arbitraryHex:
        '禁止在 class 里写裸色值（如 bg-[#333]）。请改用设计 token（bg-tooltip、bg-primary…）；确实需要新色时先在 app/globals.css 的 @theme 中新增语义 token。',
      arbitraryRadius:
        '禁止任意圆角值（如 rounded-[2px]）。请使用圆角刻度 rounded-xs / sm / md / lg / xl（见 app/globals.css 的 --radius-*）。',
    },
  },
  create(context) {
    function check(node, value) {
      if (typeof value !== 'string') return
      if (ARBITRARY_HEX_CLASS.test(value)) {
        context.report({ node, messageId: 'arbitraryHex' })
      }
      if (ARBITRARY_RADIUS_CLASS.test(value)) {
        context.report({ node, messageId: 'arbitraryRadius' })
      }
    }
    return {
      Literal(node) {
        check(node, node.value)
      },
      TemplateElement(node) {
        check(node, node.value?.raw)
      },
    }
  },
}

/** 禁止在 JSX 内联 style 里写裸色值 */
const noInlineHexColor = {
  meta: {
    type: 'problem',
    docs: { description: '禁止在 JSX 内联 style 中写裸色值' },
    schema: [],
    messages: {
      inlineHex:
        '禁止在 style 里写裸色值 {{prop}}: {{value}}。请改用 CSS 变量，例如 style={{ color: "var(--muted-foreground)" }}。',
    },
  },
  create(context) {
    return {
      JSXAttribute(node) {
        if (node.name?.type !== 'JSXIdentifier' || node.name.name !== 'style') return
        const value = node.value
        if (!value || value.type !== 'JSXExpressionContainer') return
        const expr = value.expression
        if (!expr || expr.type !== 'ObjectExpression') return

        for (const prop of expr.properties) {
          if (prop.type !== 'Property') continue
          const key = prop.key?.type === 'Identifier' ? prop.key.name : prop.key?.value
          if (!COLOR_STYLE_PROPS.has(key)) continue
          const v = prop.value
          if (v?.type !== 'Literal' || typeof v.value !== 'string') continue
          if (!HEX_COLOR.test(v.value)) continue
          context.report({
            node: v,
            messageId: 'inlineHex',
            data: { prop: key, value: v.value },
          })
        }
      },
    }
  },
}

/**
 * 禁止在标题/标签上临时拼写「字号 + 字重」组合。
 *
 * 背景：全站同一个「区块标题」曾同时存在 H2+text-base、H3+text-sm、H3+text-xs、
 * text-lg+font-bold 等写法，字号/字重/颜色各不相同，是「每个页面各写各的」
 * 最直观的来源。现在只允许三级：
 *   text-page-title（24px）页面标题、text-section-title（16px）区块标题、
 *   text-subsection-title（14px）子区块标题、text-label（14px/500）字段标签。
 *
 * 只拦已清零的历史组合（而非所有 fontSize 工具类），避免误伤表格表头等
 * 合法的 text-sm font-semibold text-muted-foreground 用法。
 */
const FORBIDDEN_TITLE_COMBOS = [
  'text-base font-semibold text-foreground',
  'text-base font-bold text-foreground',
  'text-sm font-semibold text-foreground',
  'text-sm font-bold text-foreground',
  'text-xs font-semibold text-foreground tracking-wide',
]

const noAdhocTitleTypography = {
  meta: {
    type: 'problem',
    docs: { description: '禁止临时拼写的标题字号/字重组合，必须使用标题 token 工具类' },
    schema: [],
    messages: {
      adhoc:
        '禁止临时拼写的标题字号（命中「{{combo}}」）。区块标题请用 text-section-title（16px/600），子区块标题用 text-subsection-title（14px/600），字段标签用 text-label（14px/500）——见 app/globals.css 的标题 token。',
    },
  },
  create(context) {
    function check(node, value) {
      if (typeof value !== 'string') return
      for (const combo of FORBIDDEN_TITLE_COMBOS) {
        if (value.includes(combo)) {
          context.report({ node, messageId: 'adhoc', data: { combo } })
          return
        }
      }
    }
    return {
      Literal(node) {
        check(node, node.value)
      },
      TemplateElement(node) {
        check(node, node.value?.raw)
      },
    }
  },
}

/** 卡片表面类名 */
const CARD_CLASS_TOKENS = new Set(['card', 'card-static', 'card-flat'])

/**
 * 卡片内边距只允许 4 档，禁止再出现刻度外的值。
 *
 * 允许：p-4（紧凑）/ p-5（标准）/ px-4 py-3（行式）/ px-6 py-8（空态），
 * 以及工具栏用的 p-1 / p-2；结构化卡片（自带 header/body）不写内边距。
 * 历史问题：卡片内边距散落 p-3 / p-3.5 / p-6 / p-8 / p-10 / p-12 / p-16 /
 * px-3.5 py-2.5，同一角色在不同页面差 4~24px，是「看着乱」的直观来源。
 */
const OFF_SCALE_CARD_PADDING = new Set([
  'p-2.5',
  'p-3',
  'p-3.5',
  'p-6',
  'p-8',
  'p-10',
  'p-12',
  'p-16',
  'px-2.5',
  'px-3.5',
  'py-2.5',
  'py-3.5',
  'py-12',
  'py-16',
])

const noOffScaleCardPadding = {
  meta: {
    type: 'problem',
    docs: { description: '卡片内边距超出统一刻度（p-4 / p-5 / px-4 py-3 / px-6 py-8）' },
    schema: [],
    messages: {
      offScale:
        '卡片上的内边距「{{token}}」不在统一刻度内。请用 p-4（紧凑）/ p-5（标准）/ px-4 py-3（行式）/ px-6 py-8（空态）；结构化卡片（自带 header/body）不要写内边距。',
    },
  },
  create(context) {
    function check(node, value) {
      if (typeof value !== 'string') return
      const tokens = value.split(/\s+/).filter(Boolean)
      if (!tokens.some((t) => CARD_CLASS_TOKENS.has(t))) return
      for (const t of tokens) {
        if (t.includes(':')) continue
        if (OFF_SCALE_CARD_PADDING.has(t)) {
          context.report({ node, messageId: 'offScale', data: { token: t } })
          return
        }
      }
    }
    return {
      Literal(node) {
        check(node, node.value)
      },
      TemplateElement(node) {
        check(node, node.value?.raw)
      },
    }
  },
}

/**
 * 卡片内子块堆叠间距：统一 space-y-4（16px）。
 *
 * 历史问题：同样是「卡片内的子块」，有的用 space-y-3、有的 space-y-4、
 * 还有 space-y-2/5，垂直节奏因此在页面之间起伏。
 * 需要更紧凑的列表堆叠时，把它放进卡片内的独立容器（那个容器再用 space-y-*），
 * 而不是直接挂在卡片上。
 */
const OFF_SCALE_CARD_STACK = new Set([
  'space-y-1',
  'space-y-1.5',
  'space-y-2',
  'space-y-2.5',
  'space-y-3',
  'space-y-5',
  'space-y-6',
  'space-y-8',
])

const noOffScaleCardStack = {
  meta: {
    type: 'problem',
    docs: { description: '卡片内子块堆叠间距超出统一刻度（space-y-4）' },
    schema: [],
    messages: {
      offScale:
        '卡片内的堆叠间距「{{token}}」不在统一刻度内。卡片内直接子块统一用 space-y-4（16px）；需要更紧凑的列表堆叠请放进卡片内的独立容器。',
    },
  },
  create(context) {
    function check(node, value) {
      if (typeof value !== 'string') return
      const tokens = value.split(/\s+/).filter(Boolean)
      if (!tokens.some((t) => CARD_CLASS_TOKENS.has(t))) return
      for (const t of tokens) {
        if (t.includes(':')) continue
        if (OFF_SCALE_CARD_STACK.has(t)) {
          context.report({ node, messageId: 'offScale', data: { token: t } })
          return
        }
      }
    }
    return {
      Literal(node) {
        check(node, node.value)
      },
      TemplateElement(node) {
        check(node, node.value?.raw)
      },
    }
  },
}

export default {
  rules: {
    'no-h1-with-page-shell': noH1WithPageShell,
    'no-arbitrary-design-values': noArbitraryDesignValues,
    'no-inline-hex-color': noInlineHexColor,
    'no-adhoc-title-typography': noAdhocTitleTypography,
    'no-off-scale-card-padding': noOffScaleCardPadding,
    'no-off-scale-card-stack': noOffScaleCardStack,
  },
}
