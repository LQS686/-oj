'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchWithCookie } from '@/lib/api/base'
import RestoreWizard, { formatBytes } from '@/components/backup/RestoreWizard'
import {
  DatabaseBackup,
  Download,
  Trash2,
  Plus,
  RefreshCw,
  KeyRound,
  HardDrive,
} from 'lucide-react'

interface BackupItem {
  name: string
  base: string
  sizeBytes: number
  createdAt: string
  totalDocs: number
  uploadFiles: number
  hasSecrets: boolean
  siteUrl: string
}

interface BackupConfig {
  dir: string
  keepDays: number
  keepCount: number
  maxSizeMb: number
}

interface JobState {
  jobId: string
  status: string
  stage: string
  pct: number
  message: string
  error?: string
}

export default function AdminBackupPage() {
  const [config, setConfig] = useState<BackupConfig | null>(null)
  const [items, setItems] = useState<BackupItem[]>([])
  const [creating, setCreating] = useState(false)
  const [passphrase, setPassphrase] = useState('')
  const [job, setJob] = useState<JobState | null>(null)
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadList = useCallback(async () => {
    try {
      const res = await fetchWithCookie('/api/admin/backup?action=list')
      const data = await res.json()
      if (data.success) setItems(data.data?.items || [])
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function init() {
      // 初始加载配置与备份列表（setState 均在 await 之后，避免同步触发级联渲染）
      try {
        const res = await fetchWithCookie('/api/admin/backup?action=config')
        const data = await res.json()
        if (!cancelled && data.success) setConfig(data.data || null)
      } catch {
        /* ignore */
      }
      try {
        const res = await fetchWithCookie('/api/admin/backup?action=list')
        const data = await res.json()
        if (!cancelled && data.success) setItems(data.data?.items || [])
      } catch {
        /* ignore */
      }
    }
    init()
    return () => {
      cancelled = true
    }
  }, [])

  const poll = useCallback(
    (jobId: string) => {
      if (pollTimer.current) clearInterval(pollTimer.current)
      pollTimer.current = setInterval(async () => {
        try {
          const res = await fetchWithCookie(`/api/admin/backup?action=status&id=${jobId}`)
          const data = await res.json()
          if (data.success) {
            setJob(data.data)
            if (data.data.status === 'done' || data.data.status === 'error') {
              if (pollTimer.current) clearInterval(pollTimer.current)
              loadList()
            }
          }
        } catch {
          /* ignore */
        }
      }, 1000)
    },
    [loadList]
  )

  const handleCreate = async () => {
    setCreating(true)
    setJob(null)
    try {
      const res = await fetchWithCookie('/api/admin/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passphrase: passphrase || undefined }),
      })
      const data = await res.json()
      if (!data.success) {
        alertClick(data.error || '创建备份失败')
        return
      }
      // 先显示初始状态，再开始轮询
      setJob({
        jobId: data.data.jobId,
        status: 'running',
        stage: 'prep',
        pct: 0,
        message: '准备中...',
      })
      poll(data.data.jobId)
    } catch {
      alertClick('创建备份失败，请稍后重试')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (name: string) => {
    if (!window.confirm('确定删除该备份包？此操作不可恢复。')) return
    try {
      await fetchWithCookie(`/api/admin/backup?name=${encodeURIComponent(name)}`, {
        method: 'DELETE',
      })
      loadList()
    } catch {
      alertClick('删除失败')
    }
  }

  const handleDownload = (name: string) => {
    const a = document.createElement('a')
    a.href = `/api/admin/backup?action=download&name=${encodeURIComponent(name)}`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const done = job?.status === 'done'
  const failed = job?.status === 'error'

  return (
    <div className="mx-auto w-full max-w-none space-y-6">
      {/* 只读配置提示 */}
      {config && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-background-secondary px-4 py-3 text-xs text-muted-foreground">
          <HardDrive className="w-4 h-4 shrink-0" />
          <span>
            备份目录：<code className="font-mono text-foreground">{config.dir}</code> ｜ 保留天数：
            {config.keepDays} 天 ｜ 保留份数：{config.keepCount} 份 ｜ 单包上限：
            {config.maxSizeMb} MB
          </span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 创建备份 */}
        <section className="card rounded-2xl border border-border bg-background-secondary p-5">
          <div className="mb-4 flex items-center gap-2">
            <DatabaseBackup className="w-5 h-5 text-primary" />
            <h2 className="text-subsection-title font-semibold text-foreground">手动备份</h2>
          </div>
          <div className="space-y-4">
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <KeyRound className="w-3.5 h-3.5" />
              恢复口令
              <span className="text-foreground/50">（可选，用于加密打包系统密钥）</span>
            </label>
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="留空则不在备份包中携带系统密钥"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/60"
            />
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating || job?.status === 'running'}
              className="btn btn-primary w-full disabled:opacity-60"
            >
              <Plus className="w-4 h-4" />
              {creating ? '开始中...' : job?.status === 'running' ? '备份进行中...' : '立即备份'}
            </button>

            {job && !done && !failed && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{job.message}</span>
                  <span>{Math.round(job.pct)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${Math.max(0, Math.min(100, job.pct))}%` }}
                  />
                </div>
              </div>
            )}
            {done && (
              <p className="rounded-xl border border-success/30 bg-success/5 p-3 text-sm text-success">
                备份完成，已生成到下方列表，可点击「下载」保存到本地。
              </p>
            )}
            {failed && (
              <p className="rounded-xl border border-error/30 bg-error/5 p-3 text-sm text-error">
                {job.error || '备份失败，请查看服务日志'}
              </p>
            )}
          </div>
        </section>

        {/* 备份列表 */}
        <section className="card rounded-2xl border border-border bg-background-secondary p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DatabaseBackup className="w-5 h-5 text-primary" />
              <h2 className="text-subsection-title font-semibold text-foreground">备份列表</h2>
            </div>
            <button
              onClick={() => loadList()}
              className="btn-ghost btn-icon"
              title="刷新列表"
              aria-label="刷新列表"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          {items.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">尚无备份包</p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((item) => (
                <li key={item.name} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-sm text-foreground">{item.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {new Date(item.createdAt).toLocaleString()} · {formatBytes(item.sizeBytes)} ·{' '}
                      {item.totalDocs} 条记录（{item.uploadFiles} 上传文件）
                      {item.hasSecrets ? ' · 含密钥' : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => handleDownload(item.name)}
                      className="btn-ghost btn-icon"
                      title="下载"
                      aria-label="下载"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(item.name)}
                      className="btn-ghost btn-icon destructive"
                      title="删除"
                      aria-label="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* 恢复 */}
      <section className="card rounded-2xl border border-border bg-background-secondary p-5">
        <div className="mb-4 flex items-center gap-2">
          <DatabaseBackup className="w-5 h-5 text-primary" />
          <h2 className="text-subsection-title font-semibold text-foreground">从本地上传恢复</h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          覆盖恢复会将当前数据库与上传文件替换为备份包内容。恢复前系统会自动生成一份当前状态快照。
        </p>
        <RestoreWizard
          endpoint="/api/admin/restore/upload"
          requireConfirm
          onDone={() => {
            setTimeout(() => {
              window.location.reload()
            }, 1500)
          }}
        />
      </section>
    </div>
  )
}

function alertClick(msg: string) {
  window.alert(msg)
}
