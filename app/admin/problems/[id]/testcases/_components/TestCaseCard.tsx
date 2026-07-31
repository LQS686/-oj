'use client'

import { ChevronDown, ChevronRight, Trash2, Copy, ArrowUp, ArrowDown } from 'lucide-react'

export interface EditableTestCase {
  input: string
  output: string
  isSample: boolean
  score: number
  timeLimit?: number | null
  memoryLimit?: number | null
}

interface TestCaseCardProps {
  index: number
  total: number
  tc: EditableTestCase
  expanded: boolean
  onToggle: () => void
  onChange: (patch: Partial<EditableTestCase>) => void
  onRemove: () => void
  onDuplicate: () => void
  onMove: (dir: -1 | 1) => void
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

export function TestCaseCard({
  index,
  total,
  tc,
  expanded,
  onToggle,
  onChange,
  onRemove,
  onDuplicate,
  onMove,
}: TestCaseCardProps) {
  const inputLen = tc.input.length
  const outputLen = tc.output.length

  return (
    <div className="border-b border-border last:border-b-0">
      <div className="flex items-center gap-2 px-4 py-2.5 hover:bg-muted/40 transition-colors">
        <button
          type="button"
          onClick={onToggle}
          className="p-1 rounded text-muted-foreground hover:text-foreground"
          aria-label={expanded ? '收起' : '展开'}
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <button type="button" onClick={onToggle} className="flex items-center gap-2 min-w-0 text-left flex-1">
          <span className="font-mono text-xs font-bold text-muted-foreground w-14 shrink-0">
            CASE {index + 1}
          </span>
          <span className="text-xs text-muted-foreground truncate">
            输入 {formatBytes(inputLen)} · 输出 {formatBytes(outputLen)}
            {tc.isSample ? ' · 样例' : ''}
          </span>
        </button>
        <div className="flex items-center gap-1.5 shrink-0">
          <label className="text-xs text-muted-foreground">分</label>
          <input
            type="number"
            value={tc.score}
            onChange={(e) => onChange({ score: parseInt(e.target.value, 10) || 0 })}
            className="input w-16 py-1 text-sm text-center"
            min={0}
            max={100}
          />
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            className="p-1.5 rounded text-muted-foreground hover:bg-muted disabled:opacity-30"
            title="上移"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index >= total - 1}
            className="p-1.5 rounded text-muted-foreground hover:bg-muted disabled:opacity-30"
            title="下移"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onDuplicate}
            className="p-1.5 rounded text-muted-foreground hover:bg-muted"
            title="复制"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="p-1.5 rounded text-error hover:bg-error/10"
            title="删除"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Input
                </label>
                <span className="text-xs text-muted-foreground tabular-nums">{inputLen} chars</span>
              </div>
              <textarea
                value={tc.input}
                onChange={(e) => onChange({ input: e.target.value })}
                rows={8}
                className="input font-mono text-xs resize-y min-h-[8rem]"
                placeholder="输入数据…"
                spellCheck={false}
              />
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Output
                </label>
                <span className="text-xs text-muted-foreground tabular-nums">{outputLen} chars</span>
              </div>
              <textarea
                value={tc.output}
                onChange={(e) => onChange({ output: e.target.value })}
                rows={8}
                className="input font-mono text-xs resize-y min-h-[8rem]"
                placeholder="预期输出…"
                spellCheck={false}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={tc.isSample}
                onChange={(e) => onChange({ isSample: e.target.checked })}
                className="rounded border-border"
              />
              样例测试点
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">时间(ms)</span>
              <input
                type="number"
                value={tc.timeLimit ?? ''}
                onChange={(e) => {
                  const v = e.target.value
                  const n = parseInt(v, 10)
                  onChange({ timeLimit: v === '' || Number.isNaN(n) ? null : n })
                }}
                placeholder="默认"
                min={100}
                max={30000}
                className="input w-24 py-1 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">内存(MB)</span>
              <input
                type="number"
                value={tc.memoryLimit ?? ''}
                onChange={(e) => {
                  const v = e.target.value
                  const n = parseInt(v, 10)
                  onChange({ memoryLimit: v === '' || Number.isNaN(n) ? null : n })
                }}
                placeholder="默认"
                min={32}
                max={1024}
                className="input w-24 py-1 text-sm"
              />
            </div>
            <span className="text-xs text-muted-foreground">留空使用题目默认限制</span>
          </div>
        </div>
      )}
    </div>
  )
}
