/**
 * lib/markdown/delimiters.ts
 * LaTeX 公式定界符归一化（纯函数，无 React 依赖，可单测）
 */
/* eslint-disable no-control-regex -- \u0000 用作占位符分隔符（正常题面文本不含 NUL） */

/**
 * 裸 LaTeX 数学命令白名单。
 *
 * 只包含：
 *   1. OJ 题面中极常见的数学命令（比较、算术、微积分、希腊字母等）；
 *   2. 在非数学文本中几乎不会出现的命令（避免 `C:\Windows` 被误包）。
 *
 * 故意排除的命令：
 *   - `begin`、`end`、`left`、`right`、`frac`、`sqrt` 等——常作为
 *     大型公式结构的一部分，单独出现时上下文不明确，贸然包裹容易误伤；
 *   - `r`、`n`、`d` 等单字母命令——过于宽泛，必然导致大量误匹配；
 *   - `\\`——LaTeX 换行命令，在 `\\[0.5em]` 等场景中与间距命令配合，
 *     不适合单独作为包裹触发条件。
 */
const BARE_MATH_COMMANDS: ReadonlySet<string> = new Set([
  // 比较关系
  'le', 'leq', 'leqq', 'ge', 'geq', 'geqq',
  'ne', 'neq', 'approx', 'sim', 'simeq', 'cong', 'propto',
  // 算术
  'pm', 'mp', 'times', 'div', 'cdot',
  // 微积分
  'sum', 'prod', 'int', 'iint', 'oint', 'lim', 'sup', 'inf', 'min', 'max',
  // 分式/根式
  'frac', 'dfrac', 'tfrac', 'cfrac',
  'sqrt', 'nthroot',
  // 希腊字母（小写）
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta',
  'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma',
  'tau', 'phi', 'chi', 'psi', 'omega',
  // 希腊字母（大写）
  'Gamma', 'Delta', 'Theta', 'Lambda', 'Sigma', 'Omega',
  // 省略号
  'ldots', 'cdots', 'dots', 'vdots', 'ddots',
  // 集合/逻辑
  'subset', 'subseteq', 'supset', 'supseteq', 'in', 'notin',
  'forall', 'exists', 'emptyset', 'implies', 'iff', 'therefore', 'because',
  // 三角函数/对数
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
  'arcsin', 'arccos', 'arctan',
  'sinh', 'cosh', 'tanh', 'coth',
  'log', 'ln', 'lg', 'exp',
  // accents
  'hat', 'bar', 'vec', 'dot', 'ddot', 'tilde',
  'overline', 'underline',
  // 箭头
  'leftarrow', 'rightarrow', 'leftrightarrow', 'Leftarrow', 'Rightarrow',
  'mapsto',
  // 三角/角
  'triangle', 'angle', 'perp', 'parallel',
  // 其他常见
  'ell', 'hbar', 'Re', 'Im',
])

/**
 * 判断字符是否属于「数学表达式的连续体」。
 *
 * 数学字符包括：
 *   - 拉丁字母与数字（变量、系数）
 *   - 下标/上标符号 `_` `^`
 *   - 分组符号 `{}` `()` `[]`
 *   - 数学标点 `,` `.` `·` `+` `-` `=` `*` `/`
 *   - 空白字符（空格、制表符）——表达式内部允许空格
 *   - 反斜杠（LaTeX 命令前缀，后续会校验命令名）
 *
 * 非数学字符（触发包裹边界）：
 *   - CJK 文字（中文、日文、韩文）
 *   - 非数学标点 `!` `?` `;` `:` `"` `'` `@` `#` `$` `%` `&` `~` `` ` `` `|` `<` `>`
 */
function isMathChar(ch: number): boolean {
  // ASCII 快速路径：字母、数字、下划线、caret
  if (
    (ch >= 0x41 && ch <= 0x5a) || // A-Z
    (ch >= 0x61 && ch <= 0x7a) || // a-z
    (ch >= 0x30 && ch <= 0x39) || // 0-9
    ch === 0x5f || // _
    ch === 0x5e || // ^
    ch === 0x5c || // \
    ch === 0x7b || // {
    ch === 0x7d || // }
    ch === 0x28 || // (
    ch === 0x29 || // )
    ch === 0x5b || // [
    ch === 0x5d || // ]
    ch === 0x2c || // ,
    ch === 0x2e || // .
    ch === 0xb7 || // · (middle dot)
    ch === 0x2b || // +
    ch === 0x2d || // -
    ch === 0x3d || // =
    ch === 0x2a || // *
    ch === 0x2f || // /
    ch === 0x20 || // space
    ch === 0x09 || // tab
    ch === 0x0a || // newline
    ch === 0x0d // carriage return
  ) {
    return true
  }
  // CJK 及其他非数学 Unicode 字符
  return false
}

/**
 * 检测 content 中是否存在裸 LaTeX 数学命令，
 * 若存在则将其所在的数学表达式用 `$...$` 包裹。
 *
 * 安全设计：
 *   1. 仅处理白名单内的 LaTeX 命令，不会误包 `C:\Windows` 等路径；
 *   2. 不修改已在 `$...$` / `$$...$$` 内的内容；
 *   3. 不修改代码块占位符（占位符已由调用方保护）；
 *   4. 两阶段扫描：先定位所有数学表达式边界，再统一替换，
 *      避免逐字符输出时的重复包裹问题。
 */
function wrapBareMath(content: string): string {
  if (!content) return content

  const isAlnum = (c: number) =>
    (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || (c >= 0x30 && c <= 0x39)

  // Phase 1: Identify already-delimited math regions and placeholder regions to skip
  const skipRanges: Array<[number, number]> = []
  {
    let j = 0
    while (j < content.length) {
      // Skip placeholder regions (\x00CODE_N\x00 and \x00BLANK_N\x00)
      if (content.charCodeAt(j) === 0x00) {
        const end = content.indexOf('\x00', j + 1)
        if (end !== -1) {
          skipRanges.push([j, end + 1])
          j = end + 1
          continue
        }
      }
      // Check for $$...$$ first
      if (content[j] === '$' && content[j + 1] === '$') {
        const start = j
        j += 2
        while (j < content.length - 1) {
          if (content[j] === '$' && content[j + 1] === '$') { j += 2; break }
          j++
        }
        skipRanges.push([start, j])
        continue
      }
      if (content[j] === '$') {
        const start = j; j++
        while (j < content.length) {
          if (content[j] === '$') { j++; break }
          j++
        }
        skipRanges.push([start, j])
        continue
      }
      j++
    }
  }

  const isInSkipRange = (pos: number): boolean => {
    for (const [s, e] of skipRanges) {
      if (pos >= s && pos < e) return true
    }
    return false
  }

  // Phase 2: Find all bare math expressions
  interface Expr { left: number; right: number; }
  const expressions: Expr[] = []

  let i = 0
  while (i < content.length) {
    if (isInSkipRange(i)) { i++; continue }

    // Check for LaTeX command trigger
    const cmdMatch = content.slice(i).match(/^\\([a-zA-Z]+)/)
    let triggerKind: 'command' | 'superscript' | 'subscript' | null = null
    let triggerLen = 0

    if (cmdMatch && BARE_MATH_COMMANDS.has(cmdMatch[1])) {
      triggerKind = 'command'
      triggerLen = 1 + cmdMatch[1].length
    } else if (i + 2 < content.length) {
      const c0 = content.charCodeAt(i)
      const c1 = content.charCodeAt(i + 1)
      const c2 = content.charCodeAt(i + 2)
      if (isAlnum(c0) && c1 === 0x5e && isAlnum(c2)) {
        triggerKind = 'superscript'
        triggerLen = 3
      } else if (isAlnum(c0) && c1 === 0x5f && isAlnum(c2)) {
        triggerKind = 'subscript'
        triggerLen = 3
      }
    }

    if (!triggerKind) { i++; continue }

    // Expand left: include adjacent math characters
    let left = i
    while (left > 0 && isMathChar(content.charCodeAt(left - 1))) left--

    // Expand right: include adjacent math characters
    let right = i + triggerLen
    while (right < content.length && isMathChar(content.charCodeAt(right))) right++

    // Validate: for command triggers, the expression must contain a whitelisted command
    const expr = content.slice(left, right)
    let valid = false
    if (triggerKind === 'command') {
      const m = expr.match(/\\([a-zA-Z]+)/)
      valid = !!(m && BARE_MATH_COMMANDS.has(m[1]))
    } else {
      valid = true
    }

    if (valid) {
      // Trim leading/trailing whitespace from the expression
      while (left < right && content.charCodeAt(left) === 0x20) left++
      while (right > left && content.charCodeAt(right - 1) === 0x20) right--

      if (left < right) {
        expressions.push({ left, right })
      }
      i = Math.max(right, i + triggerLen)
    } else {
      i++
    }
  }

  // Phase 3: Merge overlapping expressions
  expressions.sort((a, b) => a.left - b.left)
  const merged: Expr[] = []
  for (const expr of expressions) {
    if (merged.length > 0 && expr.left <= merged[merged.length - 1].right) {
      merged[merged.length - 1].right = Math.max(merged[merged.length - 1].right, expr.right)
    } else {
      merged.push({ ...expr })
    }
  }

  // Phase 4: Build result
  const result: string[] = []
  let pos = 0
  for (const { left, right } of merged) {
    result.push(content.slice(pos, left))
    result.push(`$${content.slice(left, right)}$`)
    pos = right
  }
  result.push(content.slice(pos))

  return result.join('')
}

/**
 * 归一化 LaTeX 公式定界符。
 *
 * 官方 remark-math 只识别 `$...$`（行内）与 `$$...$$`（块级），但题面里
 * 还存在标准 LaTeX 写法 `\(...\)` 与 `\[...\]`（Codeforces/Hydro 等导出的
 * 题面常见）。同时，部分题面（尤其是 Hydro/FPS 导出）会丢失 `$...$` 定界符，
 * 导致 `\le`、`\ge` 等裸 LaTeX 命令无法渲染。
 *
 * 处理流程：
 *   1. 保护代码块（围栏 / 行内）
 *   2. 保护空行
 *   3. 转换 `\[...\]` → `$$...$$` 与 `\(...\)` → `$...$`
 *   4. 裸 LaTeX 命令包裹：将 `\le`、`\ge` 等白名单命令所在的数学表达式
 *      用 `$...$` 包裹（仅处理明确的数学命令，跳过已有 $ 定界符的内容）
 *   5. 还原空行与代码块
 *
 * 安全设计：
 *   - 代码块先保护，后续正则永远看不到代码内容；
 *   - 裸命令包裹仅使用白名单，不会误包 `C:\Windows\System32` 等路径；
 *   - 只做定界符替换，不改写任何公式内容。
 *
 * 已知边界（有意为之）：
 *   - 货币/文本中的裸 `$`（如「售价 $5」）仍可能被 remark-math 配成公式，
 *     这是 remark-math 的设计权衡（`$...$` 是主流行内公式语法），题面中
 *     非公式美元符应写作 `\$`。
 *   - 空行内的 `\[...\]` / `\(...\)` 不配对（标准 LaTeX 中公式不跨空行），
 *     保持原文输出，避免在段落间残留孤立 `$`。
 *   - 仅出现 `^` / `_` 但无白名单命令的简短表达式（如 `x^2`）在孤立
 *     出现时不会被包裹，需配合 `$...$` 显式标记。
 */
export function normalizeLatexDelimiters(content: string): string {
  if (!content) return content

  const placeholders: string[] = []
  const protect = (match: string) => {
    const idx = placeholders.length
    placeholders.push(match)
    return `\x00CODE_${idx}\x00`
  }

  // 1. 保护代码块（先围栏后行内；占位符不含反引号，互不干扰）。
  //    围栏支持 ``` 与 ~~~ 两种（GFM），避免围栏内的定界符被误转
  let text = content.replace(/```[\s\S]*?```/g, protect)
  text = text.replace(/~~~[\s\S]*?~~~/g, protect)
  text = text.replace(/`[^`\n]+`/g, protect)

  // 2. 保护空行：remark-math 以空行为段落边界，\[...\] / \(...\) 若跨空行
  //    配对，会在段落间残留孤立 $ 或产生 KaTeX ParseError。先把连续空行换成
  //    占位符，使第 3 步的定界符正则不会跨越空行匹配。
  //    \r?\n 兼容 CRLF（Codeforces/Hydro 导出的 Windows 换行题面）
  const blanks: string[] = []
  text = text.replace(/\r?\n[ \t]*(?:\r?\n[ \t]*)+/g, (match) => {
    blanks.push(match)
    return `\u0000BLANK_${blanks.length - 1}\u0000`
  })

  // 3. 单遍转换 \[...\] 与 \(...\)（块级优先）。
  //    旧的「先块级后行内」两步写法会把 \[...\] 内嵌的 \(...\) 二次转换，
  //    在块级公式里留下裸 $ 导致 KaTeX ParseError；这里用交替正则一次完成：
  //    每个起始位置优先尝试块级（吞掉其内部的一切，含 \(...\)），失败再尝试
  //    行内，从根上避免二次转换。
  //    - [^\x00]*? ：非贪婪匹配体。空行与代码块已在前面替换为 \x00 占位符，
  //      NUL 字符不会出现在正常题面文本中，因此 [^\x00] 天然无法跨越空行/
  //      代码块占位符（等价于带 lookahead 的写法，但字符类线性扫描，大文本
  //      题面（几十 KB）下无 O(n²) 回溯，性能好 1~2 个数量级）；
  //    - (?<!\\) 前向后顾：`\\[0.5em]` 这类 LaTeX 换行+间距写法里的 `\[`
  //      前还有一个反斜杠，不能当作公式定界符开头，否则会与文末的 `\]`
  //      错误配对；
  //    - 块级内部的 \(...\) 不是合法 KaTeX 命令（`\[` 内不应嵌 `\(`，但
  //      Codeforces 等导入题面存在这种不规范写法），展开为普通括号以避免
  //      红色 ParseError；块内残留的 `\[`（内嵌块级定界符，同样是非法嵌套）
  //      对称展开为字面 `[`，避免 KaTeX 未知命令红框。
  text = text.replace(
    /(?<!\\)\\\[([^\u0000]*?)(?<!\\)\\\]|(?<!\\)\\\(([^\u0000]*?)(?<!\\)\\\)/g,
    (_match, block: string | undefined, inline: string | undefined) => {
      if (block !== undefined) {
        const inner = block
          .replace(/(?<!\\)\\\(([^\u0000]*?)(?<!\\)\\\)/g, '($1)')
          .replace(/(?<!\\)\\\[/g, '[')
        return `$$${inner}$$`
      }
      return `$${inline}$`
    }
  )

  // 4. 包裹裸 LaTeX 数学命令（\le、\ge、\sum 等）及上标/下标模式。
  //    在定界符转换之后执行，使已转换的 $...$ 内容能被正确跳过，
  //    避免双重包裹。
  text = wrapBareMath(text)

  // 5. 还原空行与代码块（单遍 replace，避免对每个占位符 split+join 重扫全文）
  text = text.replace(/\u0000BLANK_(\d+)\u0000/g, (_m, i: string) => blanks[Number(i)])
  text = text.replace(/\u0000CODE_(\d+)\u0000/g, (_m, i: string) => placeholders[Number(i)])
  return text
}
