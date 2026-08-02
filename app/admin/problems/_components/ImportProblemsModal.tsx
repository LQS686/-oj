'use client'

import { useState, useRef } from 'react'
import {
  Loader2,
  Upload,
  CheckCircle2,
  XCircle,
  SkipForward,
  Download,
  FileText,
  Package,
} from 'lucide-react'
import { fetchWithCookie } from '@/lib/api/base'
import { DIFFICULTIES } from '@/lib/constants'
import CreateModalShell from '@/components/common/CreateModalShell'

interface ResultItem {
  status: 'created' | 'skipped' | 'failed'
  title: string
  problemNumber?: string
  reason?: string
}

interface StreamEvent {
  type: 'meta' | 'item' | 'done' | 'error'
  total?: number
  index?: number
  result?: ResultItem
  summary?: { total: number; created: number; skipped: number; failed: number; message: string }
  message?: string
}

interface ImportProblemsModalProps {
  onClose: () => void
  onSuccess: () => void
}

/**
 * 批量导入题库弹窗（仅 DSOJ 标准题包）
 *
 * 上传 ZIP / tar.xz 题包后，通过 NDJSON 流实时展示导入进度：
 * 进度条、当前导入题、每题成功/跳过/失败及原因。题包内所有题目
 * （含解析失败项）都会出现在结果列表中并附带原因，不会静默丢失。
 */
export function ImportProblemsModal({ onClose, onSuccess }: ImportProblemsModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'streaming' | 'done'>('idle')
  const [total, setTotal] = useState(0)
  const [results, setResults] = useState<ResultItem[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 通用选项
  const [visibility, setVisibility] = useState<'public' | 'private' | 'contest'>('private')
  const [defaultDifficulty, setDefaultDifficulty] = useState<string>('入门')
  const [onDuplicate, setOnDuplicate] = useState<'skip' | 'overwrite' | 'duplicate'>('skip')

  const created = results.filter(r => r.status === 'created').length
  const skipped = results.filter(r => r.status === 'skipped').length
  const failed = results.filter(r => r.status === 'failed').length
  const done = results.length
  const percent = total > 0 ? Math.round((done / total) * 100) : 0

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) {
      setFile(f)
      setError('')
    }
  }

  const handleStreamEvent = (event: StreamEvent) => {
    switch (event.type) {
      case 'meta':
        setTotal(event.total ?? 0)
        break
      case 'item': {
        const r = event.result
        if (r) setResults(prev => [...prev, r])
        break
      }
      case 'done':
        if (event.summary) {
          setMessage(event.summary.message)
          if (event.summary.created > 0) onSuccess()
        }
        setPhase('done')
        break
      case 'error':
        setError(event.message || '导入失败')
        setPhase('done')
        break
    }
  }

  const handleSubmit = async () => {
    setError('')
    setMessage('')
    setResults([])
    setTotal(0)
    setSubmitting(true)
    setPhase('streaming')

    try {
      if (!file) {
        setError('请先选择文件')
        setPhase('idle')
        return
      }

      const formData = new FormData()
      formData.append('file', file)
      formData.append('format', 'dsoj')
      formData.append(
        'options',
        JSON.stringify({ visibility, defaultDifficulty, onDuplicate })
      )

      const response = await fetchWithCookie('/api/admin/problems/import', {
        method: 'POST',
        body: formData,
      })

      const contentType = response.headers.get('content-type') || ''
      if (!contentType.includes('ndjson')) {
        // 非流式响应：按 JSON 错误处理（解析前致命错误等）
        const data = await response.json().catch(() => null)
        throw new Error(
          data?.error || (response.ok ? '导入失败' : `导入失败（${response.status}）`)
        )
      }
      if (!response.body) throw new Error('响应无内容')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { done: streamDone, value } = await reader.read()
        if (streamDone) break
        buffer += decoder.decode(value, { stream: true })
        let nl = buffer.indexOf('\n')
        while (nl >= 0) {
          const line = buffer.slice(0, nl).trim()
          buffer = buffer.slice(nl + 1)
          if (line) {
            try {
              handleStreamEvent(JSON.parse(line) as StreamEvent)
            } catch {
              /* 忽略无法解析的行 */
            }
          }
          nl = buffer.indexOf('\n')
        }
      }
      const rest = buffer.trim()
      if (rest) {
        try {
          handleStreamEvent(JSON.parse(rest) as StreamEvent)
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '网络错误，请稍后重试')
    } finally {
      setPhase(p => (p === 'streaming' ? 'done' : p))
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    if (submitting) return
    onClose()
  }

  const lastResult = results[results.length - 1]

  return (
    <CreateModalShell
      open
      onClose={handleClose}
      title="批量导入题库"
      icon={Upload}
      labelledById="import-problems-modal-title"
      variant="admin"
      maxWidthClass="max-w-3xl"
    >
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5">
          {/* DSOJ 说明 */}
          <div className="p-4 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-center gap-2 mb-1">
              <Package className="w-4 h-4 text-primary" />
              <span className="font-medium text-foreground text-sm">DSOJ 标准题包 v2</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              上传 DSOJ 标准题包（ZIP / tar.xz，含 pack.yaml + problems/&lt;题号&gt;/），
              导入过程实时展示每道题的进度与结果；未成功导入的题目会附具体原因。
            </p>
            <div className="flex items-center gap-3 text-sm mt-2">
              <a
                href="/templates/dsoj-pack/dsoj-pack-template.zip"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary-dark transition-colors flex items-center gap-1"
              >
                <Download className="w-4 h-4" />
                下载模板
              </a>
              <span className="text-border">|</span>
              <a
                href="/templates/dsoj-pack/README.md"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              >
                <FileText className="w-4 h-4" />
                查看格式说明
              </a>
            </div>
          </div>

          {/* 文件上传 */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              选择文件
            </label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip,.tar.xz,.txz"
                onChange={handleFileChange}
                className="hidden"
              />
              {file ? (
                <div className="flex items-center justify-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-secondary" />
                  <span className="text-foreground font-medium">{file.name}</span>
                  <span className="text-muted-foreground">({(file.size / 1024).toFixed(1)} KB)</span>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  <Upload className="w-6 h-6 mx-auto mb-2 opacity-50" />
                  点击选择文件
                  <span className="block text-xs mt-1">支持 .zip / .tar.xz / .txz 文件，最大 50MB</span>
                </div>
              )}
            </div>
          </div>

          {/* 通用选项 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                可见性
              </label>
              <select
                value={visibility}
                onChange={e => setVisibility(e.target.value as 'public' | 'private' | 'contest')}
                className="input text-sm"
              >
                <option value="private">隐藏（推荐导入后再校对）</option>
                <option value="public">公开</option>
                <option value="contest">竞赛专用</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                默认难度
              </label>
              <select
                value={defaultDifficulty}
                onChange={e => setDefaultDifficulty(e.target.value)}
                className="input text-sm"
              >
                {DIFFICULTIES.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                重名处理
              </label>
              <select
                value={onDuplicate}
                onChange={e => setOnDuplicate(e.target.value as 'skip' | 'overwrite' | 'duplicate')}
                className="input text-sm"
              >
                <option value="skip">跳过（推荐）</option>
                <option value="overwrite">覆盖</option>
                <option value="duplicate">允许重复</option>
              </select>
            </div>
          </div>

          {/* 实时进度 */}
          {phase === 'streaming' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-foreground font-medium flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  {total > 0 ? `正在导入第 ${Math.min(done + 1, total)}/${total} 题…` : '正在解析题包…'}
                </span>
                <span className="text-muted-foreground tabular-nums">{percent}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-200"
                  style={{ width: `${percent}%` }}
                />
              </div>
              {lastResult && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {lastResult.status === 'created' && <CheckCircle2 className="w-4 h-4 text-secondary shrink-0" />}
                  {lastResult.status === 'skipped' && <SkipForward className="w-4 h-4 shrink-0" />}
                  {lastResult.status === 'failed' && <XCircle className="w-4 h-4 text-error shrink-0" />}
                  <span className="truncate">
                    {lastResult.status === 'created' && '导入成功：'}
                    {lastResult.status === 'skipped' && '跳过：'}
                    {lastResult.status === 'failed' && '失败：'}
                    {lastResult.title}
                    {lastResult.reason ? `（${lastResult.reason}）` : ''}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-error/10 border border-error/30 text-error px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* 汇总 */}
          {(phase === 'streaming' || phase === 'done') && results.length > 0 && (
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-2">
                <div className="p-3 rounded-lg bg-muted text-center">
                  <div className="text-2xl font-bold text-foreground tabular-nums">
                    {total || results.length}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">总计</div>
                </div>
                <div className="p-3 rounded-lg bg-secondary/10 text-center">
                  <div className="text-2xl font-bold text-secondary tabular-nums">{created}</div>
                  <div className="text-xs text-muted-foreground mt-1">成功</div>
                </div>
                <div className="p-3 rounded-lg bg-muted text-center">
                  <div className="text-2xl font-bold text-foreground tabular-nums">{skipped}</div>
                  <div className="text-xs text-muted-foreground mt-1">跳过</div>
                </div>
                <div className="p-3 rounded-lg bg-error/10 text-center">
                  <div className="text-2xl font-bold text-error tabular-nums">{failed}</div>
                  <div className="text-xs text-muted-foreground mt-1">失败</div>
                </div>
              </div>

              <div className="max-h-64 overflow-y-auto border border-border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">状态</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">题号</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">标题</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-3 py-2">
                          {r.status === 'created' && <CheckCircle2 className="w-4 h-4 text-secondary" />}
                          {r.status === 'skipped' && <SkipForward className="w-4 h-4 text-muted-foreground" />}
                          {r.status === 'failed' && <XCircle className="w-4 h-4 text-error" />}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground font-mono text-xs">
                          {r.problemNumber || '-'}
                        </td>
                        <td className="px-3 py-2 text-foreground">
                          {r.title.slice(0, 40)}
                          {r.title.length > 40 ? '...' : ''}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground text-xs">
                          {r.reason || (r.status === 'created' ? '导入成功' : '-')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {message && phase === 'done' && (
            <p className="text-sm text-muted-foreground text-center">{message}</p>
          )}
        </div>

        <div className="shrink-0 border-t border-border px-5 py-4 flex justify-end gap-3">
          <button onClick={handleClose} disabled={submitting} className="btn btn-ghost">
            {phase === 'done' ? '关闭' : '取消'}
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !file}
            className="btn btn-primary flex items-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                导入中...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                开始导入
              </>
            )}
          </button>
        </div>
      </div>
    </CreateModalShell>
  )
}
