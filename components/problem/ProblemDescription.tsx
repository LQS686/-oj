import { useState } from 'react'
import MarkdownRenderer from '../common/MarkdownRenderer'
import { FileCode, FileInput, FileOutput, Lightbulb, Tag, Copy, Check, ArrowUp } from 'lucide-react'
import type { Problem } from '@/types/models'

interface ProblemWithExplanation extends Problem {
  samples: Array<{ input: string; output: string; explanation?: string }>
}

interface ProblemDescriptionProps {
  problem: ProblemWithExplanation
  /** 竞赛等场景：弱化区块标题、不重复标签区 */
  compact?: boolean
  hideTags?: boolean
}

export default function ProblemDescription({
  problem,
  compact = false,
  hideTags = false,
}: ProblemDescriptionProps) {
 const [copied, setCopied] = useState<string | null>(null)

 const copyToClipboard = (text: string, id: string) => {
 navigator.clipboard.writeText(text)
 setCopied(id)
 setTimeout(() => setCopied(null), 2000)
 }

 const scrollToTop = () => {
 window.scrollTo({ top: 0, behavior: 'smooth' })
 }

 const sectionTitle = (icon: React.ReactNode, title: string) =>
    compact ? (
      <h3 className="text-sm font-semibold text-foreground mb-2">{title}</h3>
    ) : (
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">{icon}</div>
        <h3 className="text-lg font-bold text-foreground">{title}</h3>
      </div>
    )

 return (
 <div className={compact ? 'space-y-6 relative' : 'space-y-8 relative'}>
 <section className="animate-fadeIn">
 {!compact && (
 <div className="flex items-center gap-2.5 mb-4">
 <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
 <FileCode className="w-4 h-4 text-primary-light" />
 </div>
 <h3 className="text-lg font-bold text-foreground">题目描述</h3>
 </div>
 )}
 <div className="prose prose-slate max-w-none">
 <MarkdownRenderer content={problem.description} />
 </div>
 </section>

 <section className="animate-fadeIn">
 {compact ? sectionTitle(null, '输入格式') : (
 <div className="flex items-center gap-2.5 mb-4">
 <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center">
 <FileInput className="w-4 h-4 text-secondary-light" />
 </div>
 <h3 className="text-lg font-bold text-foreground">输入格式</h3>
 </div>
 )}
 <div className="prose prose-slate max-w-none">
 <MarkdownRenderer content={problem.input} />
 </div>
 </section>

 <section className="animate-fadeIn">
 {compact ? sectionTitle(null, '输出格式') : (
 <div className="flex items-center gap-2.5 mb-4">
 <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
 <FileOutput className="w-4 h-4 text-accent-light" />
 </div>
 <h3 className="text-lg font-bold text-foreground">输出格式</h3>
 </div>
 )}
 <div className="prose prose-slate max-w-none">
 <MarkdownRenderer content={problem.output} />
 </div>
 </section>

 <section className="animate-fadeIn">
 {compact ? sectionTitle(null, '样例') : (
 <div className="flex items-center gap-2.5 mb-4">
 <div className="w-8 h-8 rounded-lg bg-info/10 flex items-center justify-center">
 <FileCode className="w-4 h-4 text-cyan-400" />
 </div>
 <h3 className="text-lg font-bold text-foreground">样例</h3>
 </div>
 )}
 <div>
 {(problem.samples && problem.samples.length > 0) ? (
 problem.samples.map((sample, index: number) => (
 <div key={index} className="mb-6 last:mb-0 animate-fadeIn">
 <div className="grid md:grid-cols-2 gap-4">
 <div className="group">
 <div className="text-sm font-semibold text-foreground mb-2.5 flex items-center gap-2">
 <span className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center text-xs text-primary-light font-bold">
 {index + 1}
 </span>
 样例输入
 </div>
 <div className="relative">
 <pre className="bg-muted p-4 rounded-xl border border-border text-sm font-mono whitespace-pre-wrap break-all text-foreground overflow-x-auto group-hover:border-primary/30 transition-colors duration-300">
 {sample.input}
 </pre>
 <button
 onClick={() => copyToClipboard(sample.input, `input-${index}`)}
 className="absolute top-2 right-2 p-1.5 rounded-lg bg-muted/80 hover:bg-muted transition-colors duration-300 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
 aria-label="复制样例输入"
 >
 {copied === `input-${index}` ? (
 <Check className="w-4 h-4 text-secondary-light" />
 ) : (
 <Copy className="w-4 h-4 text-muted-foreground" />
 )}
 </button>
 </div>
 </div>
 <div className="group">
 <div className="text-sm font-semibold text-foreground mb-2.5 flex items-center gap-2">
 <span className="w-5 h-5 rounded bg-secondary/10 flex items-center justify-center text-xs text-secondary-light font-bold">
 {index + 1}
 </span>
 样例输出
 </div>
 <div className="relative">
 <pre className="bg-muted p-4 rounded-xl border border-border text-sm font-mono whitespace-pre-wrap break-all text-foreground overflow-x-auto group-hover:border-secondary/30 transition-colors duration-300">
 {sample.output}
 </pre>
 <button
 onClick={() => copyToClipboard(sample.output, `output-${index}`)}
 className="absolute top-2 right-2 p-1.5 rounded-lg bg-muted/80 hover:bg-muted transition-colors duration-300 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
 aria-label="复制样例输出"
 >
 {copied === `output-${index}` ? (
 <Check className="w-4 h-4 text-secondary-light" />
 ) : (
 <Copy className="w-4 h-4 text-muted-foreground" />
 )}
 </button>
 </div>
 </div>
 </div>
 {sample.explanation && (
 <div className="mt-3 text-sm text-muted-foreground bg-accent/5 p-4 rounded-xl border border-accent/20 hover:border-accent/30 transition-colors duration-300">
 <span className="font-semibold text-accent">说明：</span>
 <div className="prose prose-slate max-w-none text-muted-foreground mt-2">
 <MarkdownRenderer content={sample.explanation} />
 </div>
 </div>
 )}
 </div>
 ))
 ) : (
 <div className="text-muted-foreground italic">暂无样例数据</div>
 )}
 </div>
 </section>

 {problem.hint && (
 <section className="animate-fadeIn">
 {compact ? sectionTitle(null, '提示') : (
 <div className="flex items-center gap-2.5 mb-4">
 <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
 <Lightbulb className="w-4 h-4 text-accent-light" />
 </div>
 <h3 className="text-lg font-bold text-foreground">提示</h3>
 </div>
 )}
 <div className="bg-primary/5 border-l-4 border-primary p-5 rounded-xl animate-fadeIn">
 <div className="prose prose-slate max-w-none text-muted-foreground">
 <MarkdownRenderer content={problem.hint} />
 </div>
 </div>
 </section>
 )}

 {!hideTags && problem.tags && problem.tags.length > 0 && (
 <section className="animate-fadeIn">
 <div className="flex items-center gap-2.5 mb-4">
 <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
 <Tag className="w-4 h-4 text-purple-400" />
 </div>
 <h3 className="text-lg font-bold text-foreground">标签</h3>
 </div>
 <div className="flex flex-wrap gap-2">
 {problem.tags.map((tag: string) => (
 <span key={tag} className="tag tag-primary">
 {tag}
 </span>
 ))}
 </div>
 </section>
 )}

 <button
 onClick={scrollToTop}
 className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-primary/80 hover:bg-primary transition-colors duration-300 flex items-center justify-center shadow-lg z-10"
 aria-label="回到顶部"
 >
 <ArrowUp className="w-5 h-5 text-white" />
 </button>
 </div>
 )
}
