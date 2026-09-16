'use client'

import { useState, useRef } from 'react'
import { fetchWithCookie } from '@/lib/api/base'
import { Upload, KeyRound, CheckCircle2, ShieldAlert } from 'lucide-react'

interface RestoreResult {
  ok: boolean
  collectionsRestored: string[]
  totalDocs: number
  uploadsRestored: number
  warnings: string[]
  snapshotFileName?: string
  secrets?: { jwtSecret: string; encryptionKey: string }
}

interface ProgressEvent {
  stage?: string
  pct?: number
  message?: string
}

type Phase = 'idle' | 'streaming' | 'done' | 'error'

interface RestoreWizardProps {
  endpoint: string
  /** 是否要求显式确认「覆盖现有数据」（管理后台 = 是；部署引导页 = 否） */
  requireConfirm: boolean
  onDone?: (result: RestoreResult) => void
  /** 是否内联在内置卡片内（部署引导页用，隐藏外层卡片标题） */
  compact?: boolean
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export default function RestoreWizard({
  endpoint,
  requireConfirm,
  onDone,
  compact,
}: RestoreWizardProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [passphrase, setPassphrase] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState<ProgressEvent>({})
  const [result, setResult] = useState<RestoreResult | null>(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    setError('')
    setResult(null)
    setProgress({})
    setPhase('streaming')
    setSubmitting(true)
    try {
      if (!file) {
        setError('请先选择备份文件（.dsoj.gz）')
        setPhase('idle')
        return
      }
      if (requireConfirm && !confirmed) {
        setError('请先勾选「我已了解并确认覆盖」')
        setPhase('idle')
        return
      }
      const formData = new FormData()
      formData.append('file', file)
      formData.append(
        'options',
        JSON.stringify({
          passphrase: passphrase || undefined,
          allowOverwrite: reqConfirmValue(),
        })
      )
      const response = await fetchWithCookie(endpoint, { method: 'POST', body: formData })
      const contentType = response.headers.get('content-type') || ''
      if (!contentType.includes('ndjson')) {
        const data = await response.json().catch(() => null)
        throw new Error(
          data?.error || (response.ok ? '恢复失败' : `恢复失败（${response.status}）`)
        )
      }
      if (!response.body) throw new Error('响应无内容')
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { done: sd, value } = await reader.read()
        if (sd) break
        buffer += decoder.decode(value, { stream: true })
        let nl = buffer.indexOf('\n')
        while (nl >= 0) {
          const line = buffer.slice(0, nl).trim()
          buffer = buffer.slice(nl + 1)
          if (line) {
            try {
              handleEvent(JSON.parse(line))
            } catch {
              /* 忽略 */
            }
          }
          nl = buffer.indexOf('\n')
        }
      }
      const rest = buffer.trim()
      if (rest) {
        try {
          handleEvent(JSON.parse(rest))
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '网络错误，请稍后重试')
      setPhase('error')
    } finally {
      setSubmitting(false)
      setPhase((p) => (p === 'streaming' ? 'done' : p))
    }
  }

  const reqConfirmValue = () => (requireConfirm ? confirmed : true)

  const handleEvent = (event: { type?: string } & Record<string, unknown>) => {
    switch (event.type) {
      case 'progress':
        setProgress(event as ProgressEvent)
        break
      case 'done':
        setResult(event.result as RestoreResult)
        setPhase('done')
        setProgress({ pct: 100, stage: 'done', message: '恢复完成' })
        onDone?.(event.result as RestoreResult)
        break
      case 'error':
        setError(String(event.message || '恢复失败'))
        setPhase('error')
        break
    }
  }

  const secrets = result?.secrets

  return (
    <div className={compact ? 'space-y-4' : 'space-y-5'}>
      <input
        ref={fileRef}
        type="file"
        accept=".dsoj.gz,application/gzip"
        className="hidden"
        onChange={(e) => {
          setFile(e.target.files?.[0] || null)
          setError('')
        }}
      />

      {/* 文件选择 */}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={submitting}
        className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-background-secondary px-4 py-6 text-sm text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors disabled:opacity-60"
      >
        <Upload className="w-4 h-4" />
        {file ? file.name : '选择备份包（.dsoj.gz）'}
      </button>

      {/* 密钥口令（可选，包内含密钥时必填） */}
      <div>
        <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <KeyRound className="w-3.5 h-3.5" />
          恢复口令
          <span className="text-foreground/50">（备份包内含系统密钥时必填）</span>
        </label>
        <input
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          placeholder="创建备份时设置的恢复口令"
          disabled={submitting}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/60"
        />
      </div>

      {/* 覆盖确认（管理后台） */}
      {requireConfirm && (
        <label className="flex items-start gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            disabled={submitting}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">我已了解并确认覆盖</span>
            <span className="text-muted-foreground">
              ：恢复将清空并按备份重新写入数据库与上传文件。
            </span>
          </span>
        </label>
      )}

      {/* 提交 */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || phase === 'streaming'}
        className="w-full btn btn-primary disabled:opacity-60"
      >
        {submitting || phase === 'streaming' ? '恢复中，请勿关闭页面...' : '开始恢复'}
      </button>

      {/* 进度 */}
      {phase === 'streaming' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{progress.message || '正在恢复...'}</span>
            <span>{Math.round(progress.pct ?? 0)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${Math.max(0, Math.min(100, progress.pct ?? 0))}%` }}
            />
          </div>
        </div>
      )}

      {/* 成功结果 */}
      {phase === 'done' && result?.ok && (
        <div className="space-y-3 rounded-xl border border-success/30 bg-success/5 p-4 text-sm">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <CheckCircle2 className="w-4 h-4 text-success" />
            恢复完成
          </div>
          <ul className="space-y-1 text-muted-foreground">
            <li>
              还原集合：{result.collectionsRestored.length} 个，共 {result.totalDocs} 条记录
            </li>
            <li>还原上传文件：{result.uploadsRestored} 个</li>
            {result.warnings.length > 0 && (
              <li className="text-amber-600">发现警告：{result.warnings.join('；')}</li>
            )}
          </ul>
          {secrets && (
            <div className="space-y-2 rounded-lg border border-amber-300/40 bg-amber-50/70 p-3 text-xs">
              <div className="flex items-center gap-1.5 font-medium text-amber-700">
                <ShieldAlert className="w-3.5 h-3.5" />
                备份包内含系统密钥：请将其写入新站 .env 后重启服务，否则已加密数据/登录会话不可用
              </div>
              <div className="font-mono break-all text-foreground">
                <p>JWT_SECRET={secrets.jwtSecret}</p>
                <p>ENCRYPTION_KEY={secrets.encryptionKey}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 错误 */}
      {phase === 'error' && error && (
        <div className="rounded-xl border border-error/30 bg-error/5 p-3 text-sm text-error">
          {error}
        </div>
      )}
      {phase === 'idle' && error && (
        <div className="rounded-xl border border-error/30 bg-error/5 p-3 text-sm text-error">
          {error}
        </div>
      )}
    </div>
  )
}
