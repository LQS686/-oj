import CopyButton from './CopyButton'

/**
 * 题面里的纯文本数据块（如 ASCII 字符画、表格、原始数据）。
 * 用于渲染 ```plain / ```text 围栏，以及没有语言的代码块。
 *
 * 视觉上与题面里「样例输入/输出」完全一致：等宽 + bg-muted + rounded-xl + border
 * 同样支持一键复制（复制交互在 CopyButton client 组件）。
 */
export default function SampleDataBlock({ code }: { code: string }) {
  return (
    <div className="group relative my-4">
      <pre className="bg-muted p-4 rounded-xl border border-border text-sm font-mono whitespace-pre-wrap break-all text-foreground overflow-x-auto group-hover:border-primary/30 transition-colors duration-300">
        {code}
      </pre>
      <CopyButton
        code={code}
        className="absolute top-2 right-2 p-1.5 rounded-lg bg-muted/80 hover:bg-muted transition-colors duration-300 opacity-0 group-hover:opacity-100 text-muted-foreground"
        iconClassName="w-4 h-4"
      />
    </div>
  )
}
