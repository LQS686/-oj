/**
 * lib/backup/create.ts
 * 备份引擎：逐集合 EJSON 导出 → 连同 uploads / metadata /（可选）密钥打包为单个
 * <jobId>.dsoj.gz，并写侧车 <jobId>.meta.json 供列表读取。
 *
 * 仅用于手动触发 +（未来）定时任务；进度写入 jobs.ts 供前端轮询。
 */
import 'server-only'
import { createWriteStream, existsSync, statSync, type WriteStream } from 'fs'
import { writeFile, rm, readdir } from 'fs/promises'
import { join } from 'path'
import { TarArchive } from 'archiver'
import type { ArchiverError } from 'archiver'
import { BSON } from 'mongodb'
import { getBackupConfig } from './config'
import { getBackupDb } from './mongo'
import { ensureDir, listFilesRecursively } from './archive'
import { updateJob, finishJob, failJob } from './jobs'
import { collectCurrentSecrets, encryptSecrets } from './secrets'
import { logger } from '@/lib/logger'

export interface CreateBackupOptions {
  jobId: string
  /** 可选：为打包系统密钥设置的「恢复口令」。留空则不打包密钥。 */
  passphrase?: string
  onProgress?: (stage: string, pct: number, message: string) => void
}

export const BACKUP_FORMAT = 'dsoj-backup'
export const BACKUP_SCHEMA_VERSION = 1

async function writeEjsonCollection(
  db: Awaited<ReturnType<typeof getBackupDb>>,
  name: string,
  outFile: string
): Promise<number> {
  const w: WriteStream = createWriteStream(outFile)
  const collection = db.collection(name)
  let count = 0
  try {
    for await (const doc of collection.find({}).stream()) {
      const line = JSON.stringify(BSON.EJSON.serialize(doc, { relaxed: false }))
      w.write(line + '\n')
      count++
    }
  } finally {
    await new Promise<void>((resolve) => w.end(resolve))
  }
  return count
}

export async function runBackup(
  opts: CreateBackupOptions
): Promise<{ fileName: string; sizeBytes: number }> {
  const { jobId, passphrase } = opts
  const cfg = getBackupConfig()
  const tmpDir = join(cfg.dir, 'tmp', jobId)
  const dbDir = join(tmpDir, 'db')
  const finalFile = join(cfg.dir, `${jobId}.dsoj.gz`)
  const progress =
    opts.onProgress ?? ((stage, pct, message) => updateJob(jobId, { stage, pct, message }))

  try {
    await ensureDir(dbDir)

    progress('prep', 3, '正在读取数据库集合...')
    const db = await getBackupDb()
    const rawCollections = await db.listCollections().toArray()
    const collections = rawCollections
      .map((c) => c.name)
      .filter((n) => !n.startsWith('system.'))
      .sort()
    const total = collections.length

    // 导出每个集合（EJSON 逐行落盘）
    const dumpCounts: Record<string, number> = {}
    for (let i = 0; i < total; i++) {
      const name = collections[i]
      const pct = 8 + (i / Math.max(1, total)) * 70
      progress('dump', Math.round(pct), `正在导出集合 ${name}（${i + 1}/${total}）...`)
      dumpCounts[name] = await writeEjsonCollection(db, name, join(dbDir, `${name}.ndjson`))
    }
    progress('dump', 80, '数据库导出完成，正在收集上传文件...')

    // 上传文件清单（public/uploads 下，相对路径进入包内 uploads/）
    const uploadsBase = join(process.cwd(), 'public', 'uploads')
    const uploadEntries = existsSync(uploadsBase) ? await listFilesRecursively(uploadsBase) : []
    let uploadBytes = 0
    for (const e of uploadEntries) uploadBytes += statSync(e.abs).size

    // metadata.json（先写，保证恢复时最先读到）
    const siteUrl =
      process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL || ''
    const metadata = {
      format: BACKUP_FORMAT,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      appVersion: process.env.npm_package_version || 'unknown',
      createdAt: new Date().toISOString(),
      siteUrl,
      collections: collections.map((c) => ({ name: c, count: dumpCounts[c] ?? 0 })),
      uploadFiles: uploadEntries.length,
      hasSecrets: !!(passphrase && passphrase.trim()),
      backupSize: 0,
    }
    await writeFile(join(tmpDir, 'metadata.json'), JSON.stringify(metadata, null, 2))

    // 密钥（可选）
    let secretsCipher: string | undefined
    if (passphrase && passphrase.trim()) {
      const current = collectCurrentSecrets()
      if (current) {
        const enc = encryptSecrets(current, passphrase)
        secretsCipher = enc.cipher
        await writeFile(join(tmpDir, 'secrets.enc'), enc.cipher)
        await writeFile(join(tmpDir, 'secrets.salt'), enc.salt)
      } else {
        logger.warn('[backup] 已设置恢复口令，但当前环境缺少 JWT_SECRET/ENCRYPTION_KEY，密钥未打包')
      }
    }

    // 打包成 .dsoj.gz
    progress('pack', 86, '正在打包备份文件...')
    const archive = new TarArchive({ gzip: true, gzipOptions: { level: 6 } })
    const output = createWriteStream(finalFile)
    archive.pipe(output)
    archive.file(join(tmpDir, 'metadata.json'), { name: 'metadata.json' })
    // 密钥条目紧随 metadata 写入（先于任何集合数据）：恢复时可在执行
    // deleteMany/insertMany 等破坏性写入之前校验「恢复口令」，避免口令错误
    // 在数据库已被覆盖之后才报错（不可逆）。旧备份包密钥仍在末尾，恢复侧保留兜底。
    if (secretsCipher) {
      archive.file(join(tmpDir, 'secrets.enc'), { name: 'secrets.enc' })
      archive.file(join(tmpDir, 'secrets.salt'), { name: 'secrets.salt' })
    }
    for (const name of collections) {
      archive.file(join(dbDir, `${name}.ndjson`), { name: `db/${name}.ndjson` })
    }
    for (const e of uploadEntries) {
      archive.file(e.abs, { name: `uploads/${e.rel}` })
    }
    await new Promise<void>((resolve, reject) => {
      archive.on('error', reject)
      archive.on('warning', (err: ArchiverError) =>
        logger.warn('[backup] 归档警告', { error: err.message })
      )
      archive.on('end', resolve)
      archive.finalize()
    })
    await new Promise<void>((resolve) => output.end(resolve))

    const sizeBytes = statSync(finalFile).size

    // 侧车 meta（供列表读取，避免每次解包）
    const meta = {
      jobId,
      fileName: `${jobId}.dsoj.gz`,
      createdAt: metadata.createdAt,
      sizeBytes,
      collectionsCount: collections.length,
      totalDocs: Object.values(dumpCounts).reduce((a, b) => a + b, 0),
      uploadFiles: uploadEntries.length,
      uploadBytes,
      hasSecrets: !!secretsCipher,
      siteUrl: metadata.siteUrl,
    }
    await writeFile(join(cfg.dir, `${jobId}.meta.json`), JSON.stringify(meta, null, 2))

    // 清理临时目录
    await rm(tmpDir, { recursive: true, force: true })

    await cleanupExpiredBackups(cfg.dir, cfg.keepDays, cfg.keepCount)
    progress('pack', 100, '备份完成')
    finishJob(jobId, { fileName: meta.fileName, sizeBytes })
    return { fileName: meta.fileName, sizeBytes }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error(`[backup] 备份失败：${jobId}`, { error: msg })
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined)
    failJob(jobId, msg)
    throw err
  }
}

/**
 * 按保留天数与份数清理过期备份包（含 .meta.json、.dsoj.gz）。
 */
export async function cleanupExpiredBackups(
  dir: string,
  keepDays: number,
  keepCount: number
): Promise<void> {
  try {
    if (!existsSync(dir)) return
    const files = (await readdir(dir)).filter((f) => f.endsWith('.dsoj.gz'))
    const now = Date.now()
    const byTime = files
      .map((f) => ({ f, m: statSync(join(dir, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m) // 新的在前

    // 天数
    const toRemoveDays = byTime.filter((x) => now - x.m > keepDays * 24 * 3600 * 1000)
    // 份数：保留最近 keepCount 个，其余（未按天过期但超出份数）删除
    const toRemoveCount = byTime.slice(keepCount)
    const removed = new Map<string, boolean>()
    for (const x of [...toRemoveDays, ...toRemoveCount]) removed.set(x.f, true)

    for (const f of removed.keys()) {
      const base = f.replace(/\.dsoj\.gz$/, '')
      const gz = join(dir, f)
      const meta = join(dir, `${base}.meta.json`)
      await rm(gz, { force: true }).catch(() => undefined)
      await rm(meta, { force: true }).catch(() => undefined)
      logger.info('[backup] 清理过期备份', { file: f })
    }
    // 清理遗留 tmp 目录
    const tmpDir = join(dir, 'tmp')
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined)
  } catch (err) {
    logger.warn('[backup] 过期清理失败（不影响本次备份）', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/** 读取备份侧车 meta（不存在时返回 null）。 */
export async function readBackupMeta(
  dir: string,
  jobId: string
): Promise<Record<string, unknown> | null> {
  const metaFile = join(dir, `${jobId}.meta.json`)
  if (!existsSync(metaFile)) return null
  const { readFile } = await import('fs/promises')
  return JSON.parse(await readFile(metaFile, 'utf8'))
}
