'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Clock, MemoryStick, Tag, FileText, Lightbulb, Code, BookOpen } from 'lucide-react'
import type { ProblemFullInfo } from './ProblemNumberSearch'

interface ProblemDetailCardProps {
  problem: ProblemFullInfo
  /** 是否展示测试点区域（默认 true） */
  showTestCases?: boolean
  /** C++ 标程（AI 生成题目可选；spec 第 2.1 节：C++ 是唯一权威解答） */
  solutionCpp?: string
  /** 5 段式 markdown 题解（AI 生成题目可选） */
  solutionArticle?: string
  className?: string
}

/**
 * 题目完整详情卡片
 *
 * 在一个卡片中展示题目所有详情信息：
 * 题号/标题/难度/标签/描述/输入格式/输出格式/样例/提示/时间限制/内存限制
 *
 * 测试点默认折叠，点击可展开查看具体输入输出内容。
 */
export function ProblemDetailCard({
  problem,
  showTestCases = true,
  solutionCpp,
  solutionArticle,
  className = '',
}: ProblemDetailCardProps) {
  const [testCasesExpanded, setTestCasesExpanded] = useState(false)
  const [solutionCppExpanded, setSolutionCppExpanded] = useState(false)
  const [solutionArticleExpanded, setSolutionArticleExpanded] = useState(false)
  const testCases = problem.testCases || []

  return (
    <div className={`card p-4 space-y-3 ${className}`}>
      {/* 头部：题号 + 标题 + 难度 */}
      <div className="flex items-center gap-2 flex-wrap">
        {problem.problemNumber && (
          <code className="text-sm font-mono font-bold text-primary">{problem.problemNumber}</code>
        )}
        <span className="text-base font-bold text-foreground flex-1 min-w-0">{problem.title}</span>
        {problem.difficulty && (
          <span className="tag text-xs flex-shrink-0">{problem.difficulty}</span>
        )}
        {problem.isAiGenerated && (
          <span className="tag text-xs bg-primary/10 text-primary flex-shrink-0">AI 生成</span>
        )}
      </div>

      {/* 标签 */}
      {problem.tags && problem.tags.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <Tag className="w-3.5 h-3.5 text-muted-foreground" />
          {problem.tags.map((t, i) => (
            <span key={i} className="tag text-xs">{t}</span>
          ))}
        </div>
      )}

      {/* 时间限制 / 内存限制 */}
      <div className="flex items-center gap-4 text-xs text-foreground">
        {problem.timeLimit && (
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-primary" />
            时间限制 {problem.timeLimit} ms
          </span>
        )}
        {problem.memoryLimit && (
          <span className="flex items-center gap-1">
            <MemoryStick className="w-3.5 h-3.5 text-primary" />
            内存限制 {problem.memoryLimit} MB
          </span>
        )}
      </div>

      {/* 题目描述 */}
      {problem.description && (
        <div>
          <p className="text-xs font-medium text-foreground mb-1 flex items-center gap-1">
            <FileText className="w-3.5 h-3.5 text-primary" />
            题目描述
          </p>
          <pre className="text-sm text-foreground whitespace-pre-wrap break-words bg-muted/40 rounded p-2">
            {problem.description}
          </pre>
        </div>
      )}

      {/* 输入格式 */}
      {problem.input && (
        <div>
          <p className="text-xs font-medium text-foreground mb-1">输入格式</p>
          <pre className="text-sm text-foreground whitespace-pre-wrap break-words bg-muted/40 rounded p-2">
            {problem.input}
          </pre>
        </div>
      )}

      {/* 输出格式 */}
      {problem.output && (
        <div>
          <p className="text-xs font-medium text-foreground mb-1">输出格式</p>
          <pre className="text-sm text-foreground whitespace-pre-wrap break-words bg-muted/40 rounded p-2">
            {problem.output}
          </pre>
        </div>
      )}

      {/* 样例 */}
      {problem.samples && problem.samples.length > 0 && (
        <div>
          <p className="text-xs font-medium text-foreground mb-1">样例</p>
          <div className="space-y-1.5">
            {problem.samples.map((s, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="bg-muted/40 rounded p-2">
                  <p className="text-[11px] text-muted-foreground mb-0.5">输入 #{i + 1}</p>
                  <pre className="text-sm font-mono text-foreground whitespace-pre-wrap break-all">
                    {s.input || '（空）'}
                  </pre>
                </div>
                <div className="bg-muted/40 rounded p-2">
                  <p className="text-[11px] text-muted-foreground mb-0.5">输出 #{i + 1}</p>
                  <pre className="text-sm font-mono text-foreground whitespace-pre-wrap break-all">
                    {s.output || '（空）'}
                  </pre>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 提示 */}
      {problem.hint && (
        <div>
          <p className="text-xs font-medium text-foreground mb-1 flex items-center gap-1">
            <Lightbulb className="w-3.5 h-3.5 text-primary" />
            提示
          </p>
          <pre className="text-sm text-foreground whitespace-pre-wrap break-words bg-muted/40 rounded p-2">
            {problem.hint}
          </pre>
        </div>
      )}

      {/* 测试点（默认折叠，可展开） */}
      {showTestCases && (
        <div>
          <button
            type="button"
            onClick={() => setTestCasesExpanded(prev => !prev)}
            className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary w-full text-left"
          >
            {testCasesExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            测试点（{testCases.length} 个{testCases.length > 0 ? '，点击' + (testCasesExpanded ? '收起' : '展开') : ''}）
          </button>
          {testCasesExpanded && testCases.length > 0 && (
            <div className="space-y-2 mt-2">
              {testCases.map((tc, idx) => (
                <div key={tc.id || idx} className="rounded-lg border border-border overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 text-xs">
                    <span className="font-mono text-foreground">#{idx + 1}</span>
                    {tc.isSample ? (
                      <span className="tag text-xs bg-primary/10 text-primary">样例</span>
                    ) : (
                      <span className="tag text-xs">测试</span>
                    )}
                    {typeof tc.score === 'number' && (
                      <span className="text-foreground">{tc.score} 分</span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 divide-x divide-border">
                    <div className="p-2">
                      <p className="text-[11px] text-muted-foreground mb-1">输入</p>
                      <pre className="text-sm font-mono text-foreground whitespace-pre-wrap break-all">
                        {tc.input || '（空）'}
                      </pre>
                    </div>
                    <div className="p-2 md:bg-card">
                      <p className="text-[11px] text-muted-foreground mb-1">输出</p>
                      <pre className="text-sm font-mono text-foreground whitespace-pre-wrap break-all">
                        {tc.output || '（空）'}
                      </pre>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 题解 markdown（5 段式：思路分析 / 算法描述 / 复杂度分析 / 参考代码 / 关键点说明） */}
      {solutionArticle && (
        <div>
          <button
            type="button"
            onClick={() => setSolutionArticleExpanded(prev => !prev)}
            className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary w-full text-left"
          >
            {solutionArticleExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <BookOpen className="w-3.5 h-3.5 text-primary" />
            题解（点击{solutionArticleExpanded ? '收起' : '展开'}）
          </button>
          {solutionArticleExpanded && (
            <pre className="text-sm text-foreground whitespace-pre-wrap break-words bg-muted/40 rounded p-2 mt-2">
              {solutionArticle}
            </pre>
          )}
        </div>
      )}

      {/* C++ 标程（默认折叠，唯一权威标程） */}
      {solutionCpp && (
        <div>
          <button
            type="button"
            onClick={() => setSolutionCppExpanded(prev => !prev)}
            className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary w-full text-left"
          >
            {solutionCppExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <Code className="w-3.5 h-3.5 text-primary" />
            C++ 标程（点击{solutionCppExpanded ? '收起' : '展开'}）
          </button>
          {solutionCppExpanded && (
            <pre className="text-sm font-mono text-foreground whitespace-pre-wrap break-all bg-muted/40 rounded p-2 mt-2">
              {solutionCpp}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

export default ProblemDetailCard
