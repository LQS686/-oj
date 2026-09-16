/**
 * lib/backup/restore.ts
 * 恢复引擎：解析单个 .dsoj.gz → 还原集合（保留索引）+ 还原 uploads +（可选）解密系统密钥。
 *
 * 安全与策略：
 *  - 集合用 deleteMany 而非 drop，保留既有索引与唯一约束。
 *  - 恢复前若库中已有用户，先自动生成一份「恢复前快照」备份（best-effort，失败不阻断）。
 *  - 上传文件解包严格做路径穿越校验。
 */
import 'server-only'
import { createWriteStream, createReadStream } from 'fs'
import { stat, rm } from 'fs/promises'
import { join, dirname } from 'path'
import { Readable } from 'stream'
import { createInterface } from 'readline'
import zlib from 'zlib'
import tarStream from 'tar-stream'
import { BSON } from 'mongodb'
import { getBackupDb } from './mongo'
import { ensureDir, sanitizeArchiveRelPath } from './archive'
import { runBackup, BACKUP_FORMAT, BACKUP_SCHEMA_VERSION } from './create'
import { decryptSecrets, type BackupSecrets } from './secrets'
import { prisma } from '@/lib/prisma'

export interface RestoreProgress {
  stage: 'validate' | 'snapshot' | 'import' | 'uploads' | 'done' | 'error'
  pct: number // 0-100
  message: string
}

export interface RestoreResult {
  ok: boolean
  collectionsRestored: string[]
  totalDocs: number
  uploadsRestored: number
  secrets?: BackupSecrets
  warnings: string[]
  snapshotFileName?: string
}

interface RestoreOptions {
  /** 备份包字节内容（与 filePath 二选一，主要用于内存路径/测试） */
  buffer?: Buffer
  /** 备份包临时文件路径（与 buffer 二选一，流式路径，兼容大包） */
  filePath?: string
  /** 备份内含密钥时所需的恢复口令 */
  passphrase?: string
  onProgress?: (p: RestoreProgress) => void
}

const CHUNK = 2000

export async function restoreFromArchive(opts: RestoreOptions): Promise<RestoreResult> {
  const { buffer, filePath, passphrase } = opts
  const progress = opts.onProgress ?? (() => undefined)
  const warnings: string[] = []
  const collectionsRestored: string[] = []
  const collectionsCount: Record<string, number> = {}
  const uploadsRestored: string[] = []
  const collectedSecrets: Record<string, string> = {}
  /** 若在读取到数据前已成功校验口令，缓存结果，避免末尾重复解密 */
  let prevalidatedSecrets: BackupSecrets | null = null
  const result: RestoreResult = {
    ok: false,
    collectionsRestored,
    totalDocs: 0,
    uploadsRestored: 0,
    warnings,
  }

  progress({ stage: 'validate', pct: 2, message: '正在解析备份包...' })

  // 恢复前快照：仅当库中已有用户（非空库）时，避免覆盖不可逆
  progress({ stage: 'validate', pct: 3, message: '正在检查当前数据...' })
  let existingUsers = 0
  try {
    existingUsers = (await prisma.user.findFirst({ select: { id: true } })) ? 1 : 0
  } catch {
    existingUsers = 1 // 无法判定时按存在处理，提升安全性
  }

  const db = await getBackupDb()

  let validated = false
  let metadata: { format: string; schemaVersion: number; collections?: { name: string }[] } | null =
    null

  const snapshot = async (): Promise<void> => {
    if (existingUsers === 0) return
    const jobId = `pre-restore-${Date.now()}`
    progress({ stage: 'snapshot', pct: 5, message: '正在生成恢复前快照（不影响恢复）...' })
    try {
      const done = await runBackup({ jobId })
      result.snapshotFileName = done.fileName
    } catch (err) {
      warnings.push(
        '恢复前自动快照失败（已忽略）：' + (err instanceof Error ? err.message : String(err))
      )
    }
  }

  const importCollection = async (name: string, stream: NodeJS.ReadableStream): Promise<number> => {
    if (!validated) throw new Error('备份包结构无效：集合数据出现在 metadata 之前')
    const coll = db.collection(name)
    await coll.deleteMany({})
    const rl = createInterface({ input: stream, crlfDelay: Infinity })
    let batch: unknown[] = []
    let count = 0
    for await (const line of rl) {
      if (!line.trim()) continue
      batch.push(BSON.EJSON.parse(line))
      if (batch.length >= CHUNK) {
        await coll.insertMany(batch as never[])
        batch = []
      }
      count++
    }
    if (batch.length) await coll.insertMany(batch as never[])
    return count
  }

  const writeUpload = async (relPath: string, stream: NodeJS.ReadableStream): Promise<void> => {
    const safe = sanitizeArchiveRelPath(relPath)
    if (!safe) {
      warnings.push('跳过不安全的路径：' + relPath)
      stream.resume()
      return
    }
    const uploadsBase = join(process.cwd(), 'public', 'uploads')
    const target = join(uploadsBase, safe)
    // 二次兜底：确认解压目标仍在 uploadsBase 之内
    if (!target.startsWith(uploadsBase + '/')) {
      warnings.push('跳过越界路径：' + relPath)
      stream.resume()
      return
    }
    // 兼容大备份包与重复恢复：先把目标路径上已有的内容移除，避免 EEXIST（父路径被
    // 残留成文件）/ EISDIR（目标为目录）等冲突，再干净地落盘覆盖写入。
    const parentDir = dirname(target)
    // 若套级父路径被上一次未完成的恢复残留成了「文件」，会挡住 ensureDir 的 mkdir，
    // 这里先把它清掉（仅当它是文件/该类不再需要时）；目录本身则保留，交由 ensureDir 幂等补齐。
    const pdStat = await stat(parentDir).catch(() => null)
    if (pdStat && !pdStat.isDirectory()) await rm(parentDir, { recursive: true, force: true })
    await ensureDir(parentDir)
    const tStat = await stat(target).catch(() => null)
    if (tStat) {
      if (tStat.isDirectory()) await rm(target, { recursive: true, force: true })
      else await rm(target, { force: true })
    }
    await new Promise<void>((resolve, reject) => {
      const w = createWriteStream(target)
      stream.on('error', reject)
      w.on('error', reject)
      w.on('finish', resolve)
      stream.pipe(w)
    })
    uploadsRestored.push(safe)
  }

  // 恢复前快照：仅当库中已有用户（非空库）时，避免覆盖不可逆
  await snapshot()

  let done = false
  await new Promise<void>((resolve, reject) => {
    const extract = tarStream.extract()
    extract.on('error', reject)
    extract.on('entry', (header, stream, next) => {
      const rel = sanitizeArchiveRelPath(header.name)
      if (!rel) {
        stream.resume()
        return next()
      }

      // 跳过目录条目：tar 中目录以 name 尾缀 '/' 且 type=directory（tar-stream 小写）。
      // 若不跳过，会把目录当成零字节文件写出，导致后续同目录下真实文件
      // 的父目录 mkdir 时报 EEXIST。
      if (header.type === 'directory' || rel.endsWith('/')) {
        stream.resume()
        return next()
      }

      if (rel === 'metadata.json') {
        let text = ''
        stream.on('data', (c) => (text += c.toString()))
        stream.on('end', () => {
          try {
            const data = JSON.parse(text)
            if (data.format !== BACKUP_FORMAT) throw new Error('不是 DSOJ 备份包')
            if (data.schemaVersion > BACKUP_SCHEMA_VERSION)
              throw new Error('备份包来自更新的版本，请升级后再恢复')
            metadata = data
            validated = true
            next()
          } catch (err) {
            stream.destroy()
            reject(err instanceof Error ? err : new Error(String(err)))
          }
        })
        return
      }

      // 集合数据：db/<name>.ndjson
      const dbMatch = /^db\/(.+)\.ndjson$/.exec(rel)
      if (dbMatch) {
        const name = dbMatch[1]
        void importCollection(name, stream)
          .then((count) => {
            collectionsCount[name] = count
            collectionsRestored.push(name)
            const doneTotal = Object.keys(collectionsCount).length
            const total = metadata?.collections?.length ?? doneTotal
            progress({
              stage: 'import',
              pct: Math.min(85, 6 + (doneTotal / Math.max(1, total)) * 70),
              message: `正在还原集合 ${name}（${count} 条）...`,
            })
            next()
          })
          .catch((err) => {
            stream.destroy()
            reject(err instanceof Error ? err : new Error(String(err)))
          })
        return
      }

      // 上传文件：uploads/<rel>
      if (rel.startsWith('uploads/')) {
        void writeUpload(rel.slice('uploads/'.length), stream)
          .then(() => {
            progress({ stage: 'uploads', pct: 88, message: `正在还原上传文件 ${rel.slice(8)} ...` })
            next()
          })
          .catch((err) => {
            stream.destroy()
            reject(err instanceof Error ? err : new Error(String(err)))
          })
        return
      }

      // 密钥
      if (rel === 'secrets.enc' || rel === 'secrets.salt') {
        let text = ''
        stream.on('data', (c) => (text += c.toString()))
        stream.on('end', () => {
          collectedSecrets[rel === 'secrets.enc' ? 'cipher' : 'salt'] = text
          // 一读到密钥密文即校验恢复口令：新备份包把密钥写在集合数据之前，
          // 可在任何 deleteMany/insertMany 之前失败退出，避免「库已被覆盖才发现口令错误」。
          // 旧备份包密钥位于末尾，此处校验即等价于末尾校验，由下方兜底逻辑处理。
          if (rel === 'secrets.enc') {
            try {
              prevalidatedSecrets = decryptSecrets(text, passphrase ?? '')
            } catch (err) {
              stream.destroy()
              reject(err instanceof Error ? err : new Error(String(err)))
              return
            }
          }
          next()
        })
        return
      }

      stream.resume()
      next()
    })
    extract.on('finish', () => {
      done = true
      resolve()
    })
    const source = filePath ? createReadStream(filePath) : Readable.from(buffer!)
    source.pipe(zlib.createGunzip()).pipe(extract)
  })

  if (!done) {
    throw new Error('备份包解析未完成')
  }

  // 密钥解密（若有）
  if (collectedSecrets.cipher) {
    progress({ stage: 'done', pct: 94, message: '正在校验恢复口令...' })
    result.secrets =
      prevalidatedSecrets ?? decryptSecrets(collectedSecrets.cipher, passphrase ?? '')
  }

  result.ok = true
  result.collectionsRestored = collectionsRestored
  result.totalDocs = Object.values(collectionsCount).reduce((a, b) => a + b, 0)
  result.uploadsRestored = uploadsRestored.length
  progress({ stage: 'done', pct: 100, message: '恢复完成' })

  // 恢复后引导缓存可能已改变（空库装上备份），立即失效以免中间件继续跳 /setup
  try {
    const { invalidateBootstrapCache } = await import('@/lib/bootstrap-guard')
    invalidateBootstrapCache()
  } catch {
    /* 非关键失败忽略 */
  }
  return result
}

/** 空库门控：用于设置页恢复前的自检（与 getPublicSettings 口径一致）。 */
export async function isDatabaseEmpty(): Promise<boolean> {
  try {
    return (await prisma.user.findFirst({ select: { id: true } })) === null
  } catch {
    // fail-closed：无法判定时视为「非空库」，拒绝走 /setup 的破坏性恢复路径。
    // （返回 true 会让「数据库不可用」被当成空库，从而放行覆盖式恢复。）
    return false
  }
}
