'use client'

import { useState, useRef } from 'react'
import {
  Loader2,
  Upload,
  FileCode,
  Database,
  CheckCircle2,
  XCircle,
  SkipForward,
  X,
  Globe,
  Sparkles,
} from 'lucide-react'
import { fetchWithCookie } from '@/lib/api/base'
import { DIFFICULTIES } from '@/lib/constants'

type Format = 'fps' | 'hydro' | 'syzoj' | 'csv' | 'codeforces'

interface ResultItem {
  status: 'created' | 'skipped' | 'failed'
  title: string
  problemNumber?: string
  reason?: string
}

interface ImportResult {
  total: number
  created: number
  skipped: number
  failed: number
  results: ResultItem[]
  message?: string
}

interface ImportProblemsModalProps {
  onClose: () => void
  onSuccess: () => void
}

const FORMAT_OPTIONS: {
  id: Format
  label: string
  desc: string
  accept: string
  icon: typeof FileCode
}[] = [
  {
    id: 'fps',
    label: 'FPS',
    desc: 'Free Problem Set XML/JSON，国内最通用题库交换格式（含测试用例）',
    accept: '.xml,.json',
    icon: FileCode,
  },
  {
    id: 'hydro',
    label: 'Hydro',
    desc: 'Hydro OJ 题库包（ZIP，含 problem.yaml + tests/）',
    accept: '.zip,.json',
    icon: Database,
  },
  {
    id: 'syzoj',
    label: 'SYZOJ',
    desc: 'SYZOJ / QDUOJ 题库导出 JSON（单题或多题数组）',
    accept: '.json',
    icon: Database,
  },
  {
    id: 'csv',
    label: 'CSV',
    desc: 'CSV 表格批量录入（仅题面，无测试用例）',
    accept: '.csv',
    icon: FileCode,
  },
  {
    id: 'codeforces',
    label: 'Codeforces',
    desc: '从 Codeforces 官方 API 同步（仅元数据，需手动补题面）',
    accept: '',
    icon: Globe,
  },
]

/**
 * 批量导入题库弹窗
 *
 * 支持 FPS / Hydro / SYZOJ / CSV 文件上传，以及 Codeforces API 同步。
 * 提交后展示每题导入结果（成功 / 跳过 / 失败）。
 */
export function ImportProblemsModal({ onClose, onSuccess }: ImportProblemsModalProps) {
  const [format, setFormat] = useState<Format>('fps')
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 通用选项
  const [visibility, setVisibility] = useState<'public' | 'private' | 'contest'>('private')
  const [defaultDifficulty, setDefaultDifficulty] = useState<string>('入门')
  const [onDuplicate, setOnDuplicate] = useState<'skip' | 'overwrite' | 'duplicate'>('skip')

  // Codeforces 专用
  const [cfTags, setCfTags] = useState('')
  const [cfRatingMin, setCfRatingMin] = useState('')
  const [cfRatingMax, setCfRatingMax] = useState('')
  const [cfLimit, setCfLimit] = useState('100')

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) {
      setFile(f)
      setError('')
    }
  }

  const handleSubmit = async () => {
    setError('')
    setResult(null)

    if (format !== 'codeforces' && !file) {
      setError('请先选择文件')
      return
    }

    setSubmitting(true)
    try {
      const options = {
        visibility,
        defaultDifficulty,
        onDuplicate,
        ...(format === 'codeforces'
          ? {
              cfTags: cfTags
                .split(/[,，]/)
                .map(t => t.trim())
                .filter(Boolean),
              cfRatingRange:
                cfRatingMin && cfRatingMax
                  ? [parseInt(cfRatingMin, 10), parseInt(cfRatingMax, 10)]
                  : undefined,
              cfLimit: parseInt(cfLimit, 10) || 100,
            }
          : {}),
      }

      let response: Response
      if (format === 'codeforces') {
        response = await fetchWithCookie('/api/admin/problems/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ format, options }),
        })
      } else {
        const formData = new FormData()
        formData.append('file', file!)
        formData.append('format', format)
        formData.append('options', JSON.stringify(options))
        response = await fetchWithCookie('/api/admin/problems/import', {
          method: 'POST',
          body: formData,
        })
      }

      const data = await response.json()
      if (data.success) {
        setResult(data.data)
        if (data.data.created > 0) {
          onSuccess()
        }
      } else {
        setError(data.error || '导入失败')
      }
    } catch (err) {
      setError('网络错误，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    if (submitting) return
    onClose()
  }

  const currentFormat = FORMAT_OPTIONS.find(f => f.id === format)!

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] p-4">
      <div className="card max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-background border-b border-border px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/10">
              <Upload className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">批量导入题库</h3>
              <p className="text-xs text-muted-foreground">
                支持 FPS / Hydro / SYZOJ / CSV / Codeforces
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={submitting}
            className="p-2 hover:bg-muted rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Format Selector */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              导入格式
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {FORMAT_OPTIONS.map(opt => {
                const Icon = opt.icon
                const selected = format === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setFormat(opt.id)
                      setFile(null)
                      setResult(null)
                      setError('')
                    }}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      selected
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className={`w-4 h-4 ${selected ? 'text-primary' : 'text-muted-foreground'}`} />
                      <span className="font-medium text-foreground text-sm">{opt.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {opt.desc}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>

          {/* File Upload (非 Codeforces) */}
          {format !== 'codeforces' && (
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
                  accept={currentFormat.accept}
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
                    <span className="block text-xs mt-1">
                      支持 {currentFormat.accept || '该格式'} 文件，最大 50MB
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Codeforces Options */}
          {format === 'codeforces' && (
            <div className="space-y-3 p-4 rounded-lg bg-muted/50 border border-border">
              <div className="flex items-center gap-2 text-sm text-foreground">
                <Globe className="w-4 h-4 text-primary" />
                <span className="font-medium">Codeforces API 同步参数</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Tags 过滤（逗号分隔，如 dp,greedy，留空同步全部）
                  </label>
                  <input
                    type="text"
                    value={cfTags}
                    onChange={e => setCfTags(e.target.value)}
                    placeholder="dp,greedy,math"
                    className="input text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Rating 最小值（800-3500）
                  </label>
                  <input
                    type="number"
                    value={cfRatingMin}
                    onChange={e => setCfRatingMin(e.target.value)}
                    placeholder="800"
                    min="800"
                    max="3500"
                    className="input text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Rating 最大值（800-3500）
                  </label>
                  <input
                    type="number"
                    value={cfRatingMax}
                    onChange={e => setCfRatingMax(e.target.value)}
                    placeholder="2000"
                    min="800"
                    max="3500"
                    className="input text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    最大同步题数（1-500）
                  </label>
                  <input
                    type="number"
                    value={cfLimit}
                    onChange={e => setCfLimit(e.target.value)}
                    placeholder="100"
                    min="1"
                    max="500"
                    className="input text-sm"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground flex items-start gap-1">
                <Sparkles className="w-3 h-3 mt-0.5 shrink-0" />
                <span>
                  Codeforces API 仅提供题目元数据，题面会写入"参见 CF 原题链接"占位，
                  导入后可在编辑页手动补充完整题面与测试用例。
                </span>
              </p>
            </div>
          )}

          {/* Common Options */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                可见性
              </label>
              <select
                value={visibility}
                onChange={e => setVisibility(e.target.value as any)}
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
                onChange={e => setOnDuplicate(e.target.value as any)}
                className="input text-sm"
              >
                <option value="skip">跳过（推荐）</option>
                <option value="overwrite">覆盖</option>
                <option value="duplicate">允许重复</option>
              </select>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-error/10 border border-error/30 text-error px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-2">
                <div className="p-3 rounded-lg bg-muted text-center">
                  <div className="text-2xl font-bold text-foreground tabular-nums">
                    {result.total}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">总计</div>
                </div>
                <div className="p-3 rounded-lg bg-secondary/10 text-center">
                  <div className="text-2xl font-bold text-secondary tabular-nums">
                    {result.created}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">成功</div>
                </div>
                <div className="p-3 rounded-lg bg-muted text-center">
                  <div className="text-2xl font-bold text-foreground tabular-nums">
                    {result.skipped}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">跳过</div>
                </div>
                <div className="p-3 rounded-lg bg-error/10 text-center">
                  <div className="text-2xl font-bold text-error tabular-nums">
                    {result.failed}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">失败</div>
                </div>
              </div>

              {result.results.length > 0 && (
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
                      {result.results.map((r, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="px-3 py-2">
                            {r.status === 'created' && (
                              <CheckCircle2 className="w-4 h-4 text-secondary" />
                            )}
                            {r.status === 'skipped' && (
                              <SkipForward className="w-4 h-4 text-muted-foreground" />
                            )}
                            {r.status === 'failed' && (
                              <XCircle className="w-4 h-4 text-error" />
                            )}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground font-mono text-xs">
                            {r.problemNumber || '-'}
                          </td>
                          <td className="px-3 py-2 text-foreground">
                            {r.title.slice(0, 40)}
                            {r.title.length > 40 ? '...' : ''}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground text-xs">
                            {r.reason || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {result.message && (
                <p className="text-sm text-muted-foreground text-center">
                  {result.message}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-background border-t border-border px-6 py-4 flex justify-end gap-3">
          <button
            onClick={handleClose}
            disabled={submitting}
            className="btn btn-ghost"
          >
            {result ? '关闭' : '取消'}
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || (format !== 'codeforces' && !file)}
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
    </div>
  )
}
