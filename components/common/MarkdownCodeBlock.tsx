import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vs } from 'react-syntax-highlighter/dist/esm/styles/prism'
import SampleDataBlock from './SampleDataBlock'
import CopyButton from './CopyButton'

// 视为「纯文本/数据块」的语言标识（洛谷/Hydro 题面常见 ```plain）
// 这些代码块不需要语法高亮工具栏，应与题面样例输入/输出一致
const PLAIN_LANGS = new Set(['plain', 'plaintext', 'text', 'txt', 'output', 'sample', 'console'])

// 按需注册 Prism 语言包，避免加载全部 ~280 种语言（包体积从 2.19MB 降至 ~200KB）
// 项目实际只展示 OJ 相关的 8 种语言；text/plaintext 不注册，PrismLight 自动降级为纯文本
import cpp from 'react-syntax-highlighter/dist/esm/languages/prism/cpp'
import c from 'react-syntax-highlighter/dist/esm/languages/prism/c'
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python'
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java'
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript'
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript'
import go from 'react-syntax-highlighter/dist/esm/languages/prism/go'
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust'

SyntaxHighlighter.registerLanguage('cpp', cpp)
SyntaxHighlighter.registerLanguage('c', c)
SyntaxHighlighter.registerLanguage('python', python)
SyntaxHighlighter.registerLanguage('java', java)
SyntaxHighlighter.registerLanguage('javascript', javascript)
SyntaxHighlighter.registerLanguage('typescript', typescript)
SyntaxHighlighter.registerLanguage('go', go)
SyntaxHighlighter.registerLanguage('rust', rust)

const LANGUAGE_LABELS: Record<string, string> = {
  cpp: 'C++',
  c: 'C',
  cxx: 'C++',
  cc: 'C++',
  python: 'Python',
  py: 'Python',
  python3: 'Python',
  java: 'Java',
  javascript: 'JavaScript',
  js: 'JavaScript',
  typescript: 'TypeScript',
  ts: 'TypeScript',
  go: 'Go',
  rust: 'Rust',
  text: 'Text',
  plaintext: 'Text',
}

/** VS 浅色主题：去掉自带灰底，交给外壳控制 */
const CODE_THEME = {
  ...vs,
  'code[class*="language-"]': {
    ...vs['code[class*="language-"]'],
    background: 'transparent',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.8125rem',
    lineHeight: '1.7',
    color: '#1f2328',
  },
  'pre[class*="language-"]': {
    ...vs['pre[class*="language-"]'],
    background: 'transparent',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.8125rem',
    lineHeight: '1.7',
    margin: 0,
    padding: 0,
    border: 'none',
    boxShadow: 'none',
  },
}

function languageLabel(lang: string): string {
  const key = (lang || 'text').toLowerCase()
  // 别名归一化（与 highlighterLanguage 保持一致）
  if (key === 'c++' || key === 'cxx' || key === 'cc') return 'C++'
  if (key === 'py' || key === 'python3') return 'Python'
  if (key === 'js') return 'JavaScript'
  if (key === 'ts') return 'TypeScript'
  return LANGUAGE_LABELS[key] || 'Text'
}

function highlighterLanguage(lang: string): string {
  const key = (lang || 'text').toLowerCase()
  if (key === 'c++' || key === 'cxx' || key === 'cc') return 'cpp'
  if (key === 'py' || key === 'python3') return 'python'
  if (key === 'js') return 'javascript'
  if (key === 'ts') return 'typescript'
  return key || 'text'
}

/** 是否是纯文本/数据块（走 SampleDataBlock 而不是代码高亮） */
function isPlainLang(lang: string): boolean {
  const key = (lang || '').toLowerCase()
  return PLAIN_LANGS.has(key)
}

export default function MarkdownCodeBlock({
  language,
  code,
}: {
  language: string
  code: string
}) {
  const label = languageLabel(language)
  const hlLang = highlighterLanguage(language)

  // 题面里的纯文本/数据块（```plain 等）：走 SampleDataBlock 与样例输入输出一致
  if (isPlainLang(language)) {
    return <SampleDataBlock code={code} />
  }

  return (
    <div className="markdown-code-shell group">
      <div className="markdown-code-toolbar">
        <span className="markdown-code-lang">{label}</span>
        <CopyButton
          code={code}
          className="markdown-code-copy"
          iconClassName="w-3.5 h-3.5"
          showLabel
        />
      </div>
      <div className="markdown-code-body">
        <SyntaxHighlighter
          style={CODE_THEME}
          language={hlLang}
          PreTag="div"
          showLineNumbers={code.split('\n').length >= 8}
          lineNumberStyle={{
            minWidth: '2.25em',
            paddingRight: '1em',
            color: '#8b949e',
            userSelect: 'none',
          }}
          customStyle={{
            margin: 0,
            padding: 0,
            background: 'transparent',
            fontSize: '0.8125rem',
            lineHeight: 1.7,
          }}
          codeTagProps={{
            style: {
              fontFamily: 'var(--font-mono)',
              fontSize: '0.8125rem',
              lineHeight: 1.7,
            },
          }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  )
}
