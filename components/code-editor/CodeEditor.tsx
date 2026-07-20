'use client'

/**
 * 通用代码编辑器组件（基于 CodeMirror 6）
 *
 * 参考 Hydro OJ（Monaco + Scratchpad）与 HOJ（CodeMirror）的代码编辑体验：
 *   - 语法高亮（C/C++/Python）
 *   - 行号、自动缩进、括号匹配
 *   - 暗色/亮色主题自适应（参考 Tailwind dark: 变量）
 *   - 占位符提示
 *   - Ctrl+Enter 提交快捷键（onSubmit 回调）
 *
 * 设计目标：替换原有裸 <textarea>，保持受控用法一致（value + onChange）。
 */
import { useMemo, useCallback } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { cpp } from '@codemirror/lang-cpp'
import { python } from '@codemirror/lang-python'
import { EditorView } from '@codemirror/view'
import { Extension } from '@codemirror/state'

// 项目支持的语言列表（与各页面的 languageOptions 保持一致）
export type CodeLanguage = 'cpp' | 'c' | 'python'

export interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  language?: CodeLanguage
  placeholder?: string
  /** 编辑器高度（CSS 值，如 '360px'、'100%'），默认 '360px' */
  height?: string
  /** Ctrl+Enter 回调（提交代码） */
  onSubmit?: () => void
  /** 是否只读 */
  readOnly?: boolean
  /** 透传给外层容器的 className */
  className?: string
  /** maxLength 限制（与原 textarea 保持兼容，超过则不允许继续输入） */
  maxLength?: number
}

/** 将语言字符串映射为 CodeMirror 语言扩展 */
function getLanguageExtension(lang: CodeLanguage | undefined): Extension[] {
  switch (lang) {
    case 'cpp':
    case 'c':
      // cpp() 同时支持 C 和 C++
      return [cpp()]
    case 'python':
      return [python()]
    default:
      return []
  }
}

/** 自定义主题：让 CodeMirror 编辑器外观与项目卡片风格一致 */
const customTheme = EditorView.theme({
  '&': {
    backgroundColor: 'transparent',
    color: 'var(--foreground, #e5e7eb)',
    fontSize: '13px',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    height: '100%',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--muted-foreground, #6b7280)',
    border: 'none',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'var(--muted, rgba(255,255,255,0.04))',
  },
  '.cm-activeLine': {
    backgroundColor: 'var(--muted, rgba(255,255,255,0.04))',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-content': {
    padding: '8px 0',
  },
  '.cm-placeholder': {
    color: 'var(--muted-foreground, #6b7280)',
    fontStyle: 'italic',
  },
  '.cm-scroller': {
    fontFamily: 'inherit',
  },
})

export default function CodeEditor({
  value,
  onChange,
  language,
  placeholder,
  height = '360px',
  onSubmit,
  readOnly = false,
  className = '',
  maxLength,
}: CodeEditorProps) {
  const extensions = useMemo(() => {
    const exts = [...getLanguageExtension(language), customTheme]
    return exts
  }, [language])

  // maxLength 限制：通过 onChange 拦截超长输入（兼容原 textarea 行为）
  // 不使用 EditorState.changeFilter 是为了保持 API 简单且避免版本差异
  const handleChange = useCallback(
    (val: string) => {
      if (maxLength && val.length > maxLength) {
        onChange(val.slice(0, maxLength))
        return
      }
      onChange(val)
    },
    [maxLength, onChange]
  )

  // Ctrl+Enter 提交（参考原 textarea 的快捷键行为）
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      onSubmit?.()
    }
  }

  return (
    <div
      className={`w-full rounded-xl bg-muted text-foreground border border-border hover:border-primary/30 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-colors duration-300 overflow-hidden ${className}`}
      style={{ height }}
      onKeyDown={handleKeyDown}
      data-testid="code-editor-wrapper"
    >
      <CodeMirror
        value={value}
        onChange={handleChange}
        extensions={extensions}
        placeholder={placeholder}
        height={height}
        readOnly={readOnly}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: true,
          indentOnInput: true,
          tabSize: 4,
          highlightSelectionMatches: true,
          foldGutter: false,
          searchKeymap: true,
        }}
        style={{ height: '100%' }}
      />
    </div>
  )
}
