/**
 * /api/admin/backup - 备份与恢复（系统管理员）
 *
 * POST          手动创建备份任务（后台异步），返回 { jobId }
 * GET ?action=status&id=      查询任务进度
 * GET ?action=list            备份包列表
 * GET ?action=download&name=  流式下载备份包
 * GET ?action=config          只读配置（目录/保留策略/大小上限）
 * DELETE ?name=               删除备份包及侧车 meta
 */
import { withApi, throw400 } from '@/lib/api/withApi'
import { ok } from '@/lib/api/response'
import { createReadStream, existsSync, statSync } from 'fs'
import { readdir, rm } from 'fs/promises'
import { join } from 'path'
import { Readable } from 'node:stream'
import { getBackupConfig } from '@/lib/backup/config'
import { runBackup } from '@/lib/backup/create'
import { createJob, getJob, hasRunningJob } from '@/lib/backup/jobs'
import { readBackupMeta } from '@/lib/backup/create'
import { logger } from '@/lib/logger'

const SAFE_NAME = /^[A-Za-z0-9_-]+\.dsoj\.gz$/

function requireBackupDir(): string {
  const cfg = getBackupConfig()
  return cfg.dir
}

function resolveBackupFile(name: string): { abs: string; base: string } | null {
  if (!SAFE_NAME.test(name)) return null
  const dir = requireBackupDir()
  return { abs: join(dir, name), base: name.replace(/\.dsoj\.gz$/, '') }
}

export const runtime = 'nodejs'

export const POST = withApi.systemAdmin(async (req) => {
  if (hasRunningJob()) {
    throw400('BACKUP_BUSY', '已有备份任务正在进行，请等待完成后再试')
  }
  const body = (await req.json().catch(() => ({}))) as { passphrase?: string }
  const passphrase =
    typeof body.passphrase === 'string' && body.passphrase.trim()
      ? body.passphrase.trim()
      : undefined

  const job = createJob('准备中...')
  void runBackup({ jobId: job.jobId, passphrase }).catch(() => undefined)

  return ok({ jobId: job.jobId })
})

export const GET = withApi.systemAdmin(async (req) => {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action') || 'list'

  if (action === 'status') {
    const id = searchParams.get('id') || ''
    const job = getJob(id)
    if (!job) throw400('JOB_NOT_FOUND', '备份任务不存在或已过期')
    return ok(job)
  }

  if (action === 'list') {
    const dir = requireBackupDir()
    if (!existsSync(dir)) return ok({ items: [] })
    const files = (await readdir(dir)).filter((f) => f.endsWith('.dsoj.gz'))
    const items = []
    for (const f of files) {
      const base = f.replace(/\.dsoj\.gz$/, '')
      const abs = join(dir, f)
      const stat = statSync(abs)
      const meta = await readBackupMeta(dir, base)
      items.push({
        name: f,
        base,
        sizeBytes: stat.size,
        createdAt: meta?.createdAt ?? new Date(stat.mtimeMs).toISOString(),
        totalDocs: meta?.totalDocs ?? 0,
        uploadFiles: meta?.uploadFiles ?? 0,
        hasSecrets: meta?.hasSecrets ?? false,
        siteUrl: meta?.siteUrl ?? '',
      })
    }
    items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    return ok({ items })
  }

  if (action === 'config') {
    return ok(getBackupConfig())
  }

  if (action === 'download') {
    const name = searchParams.get('name') || ''
    const resolved = resolveBackupFile(name)
    if (!resolved) return throw400('FILE_NOT_FOUND', '备份包不存在')
    if (!existsSync(resolved.abs)) return throw400('FILE_NOT_FOUND', '备份包不存在')
    const size = statSync(resolved.abs).size
    const nodeStream = createReadStream(resolved.abs)
    const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>
    return new Response(webStream, {
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Length': String(size),
        'Content-Disposition': `attachment; filename="${name}"`,
        'X-Content-Type-Options': 'nosniff',
        'X-Accel-Buffering': 'no',
        'Cache-Control': 'no-store',
      },
    })
  }

  throw400('INVALID_ACTION', '不支持的操作')
})

export const DELETE = withApi.systemAdmin(async (req) => {
  const { searchParams } = new URL(req.url)
  const name = searchParams.get('name') || ''
  const resolved = resolveBackupFile(name)
  if (!resolved) return throw400('FILE_NOT_FOUND', '备份包不存在')
  if (!existsSync(resolved.abs)) return throw400('FILE_NOT_FOUND', '备份包不存在')
  await rm(resolved.abs, { force: true })
  await rm(join(requireBackupDir(), `${resolved.base}.meta.json`), { force: true })
  logger.info('[backup] 删除备份包', { name })
  return ok({ deleted: name })
})
