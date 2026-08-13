import { Code as CodeIcon } from 'lucide-react'

/**
 * 提交列的语言选项与头部（轻量，可同步引入）。
 * 从 ProblemSubmitColumn 中拆出，避免懒加载编辑器时连带引入 CodeMirror 等重依赖。
 */
export const WORKSPACE_LANGUAGE_OPTIONS = [
  { value: 'cpp', label: 'C++', version: 'C++17' },
  { value: 'c', label: 'C', version: 'C11' },
  { value: 'python', label: 'Python', version: 'Python 3.10' },
] as const

export function ProblemSubmitColumnHeader() {
  return (
    <>
      <CodeIcon className="w-4 h-4 text-primary-light" />
      <h3 className="text-sm font-medium text-foreground">提交代码</h3>
    </>
  )
}
