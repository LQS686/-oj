/**
 * lib/backup/restore-upload.ts
 * 恢复上传：把 multipart 中的「file」部件流式写入临时文件（不整包载入内存），
 * 其余小字段（options）累积返回，从而支持数 GB 的大备份包恢复。
 *
 * 边收边写 + 背压处理，内存占用与包大小无关；超过 maxBytes 即刻中断并抛错，
 * 防止临时盘被写满。
 */
import 'server-only'
import { createWriteStream } from 'fs'
import { rm } from 'fs/promises'
import { once } from 'events'
import { Readable } from 'stream'
import { join } from 'path'
import { getBackupConfig } from './config'
import { ensureDir } from './archive'

export interface BackupUploadResult {
  /** 落盘的备份包临时文件绝对路径 */
  filePath: string
  /** 已写入的字节数 */
  fileSize: number
  /** multipart 中可选字段 options 的原始 JSON 文本（无则 undefined） */
  optionsRaw?: string
  /** 删除临时文件（含其目录） */
  cleanup: () => Promise<void>
}

/** 非 file 小字段（如 options）的内存上限 */
const MAX_FIELD_BYTES = 128 * 1024

/**
 * 从 Request 流式解析 multipart，把 file 部件写入临时文件。
 * @param req       上传请求（content-type 须为 multipart/form-data）
 * @param maxBytes  备份包体积上限，超限抛 'PAYLOAD_TOO_LARGE'
 */
export async function uploadBackupToTemp(
  req: Request,
  maxBytes: number
): Promise<BackupUploadResult> {
  const contentType = req.headers.get('content-type') || ''
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)
  const boundary = (boundaryMatch?.[1] || boundaryMatch?.[2] || '').trim()
  if (!contentType.includes('multipart/form-data') || !boundary) {
    throw new Error('INVALID_BOUNDARY')
  }
  if (!req.body) throw new Error('INVALID_BOUNDARY')

  const baseDir = join(getBackupConfig().dir, '.restore-tmp')
  const runDir = join(
    baseDir,
    `up-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  )
  await ensureDir(runDir)
  const filePath = join(runDir, 'backup.dsoj.gz')
  const cleanup = (): Promise<void> => rm(runDir, { recursive: true, force: true })

  const w = createWriteStream(filePath)
  const source = Readable.fromWeb(req.body as unknown as Parameters<typeof Readable.fromWeb>[0])

  const SEP = `--${boundary}`
  // 尾部窗口：跨 chunk 时可能被截断的边界片段，需保留
  const KEEP = SEP.length + 8
  const MARKER = Buffer.from(`\r\n${SEP}`)

  type Phase = 'preface' | 'header' | 'data' | 'done'
  let buf: Buffer = Buffer.alloc(0)
  let state: Phase = 'preface'
  // 读取当前状态：经函数返回完整 union，避免 TS 在跨函数副作用后按字面量收窄
  const phaseNow = (): Phase => state
  let currentName: string | null = null
  let inFile = false
  let optionsBuf: Buffer | null = null
  let fileSize = 0

  // 向写流写入数据（带背压，保持内存恒定）
  const writeBytes = async (body: Buffer): Promise<void> => {
    if (!body.length) return
    fileSize += body.length
    if (fileSize > maxBytes) {
      source.destroy()
      w.destroy()
      throw new Error('PAYLOAD_TOO_LARGE')
    }
    if (!w.write(body)) await once(w, 'drain')
  }

  // 消费 buf 推进状态机，返回未消费的剩余（含尾部窗口）
  const consume = async (): Promise<Buffer> => {
    while (buf.length) {
      if (state === 'done') return buf

      if (state === 'preface') {
        const start = buf.indexOf(Buffer.from(SEP))
        if (start === -1) {
          // 未到首个边界：数据若远大于窗口即异常，直接丢弃
          return buf.length > KEEP ? buf.subarray(buf.length - KEEP) : buf
        }
        if (buf.length < start + SEP.length + 2) return buf
        const after = buf[start + SEP.length]
        if (after === 0x2d && buf[start + SEP.length + 1] === 0x2d) {
          state = 'done'
          return buf
        }
        buf = buf.subarray(start + SEP.length)
        if (buf[0] === 0x0d && buf[1] === 0x0a) buf = buf.subarray(2)
        state = 'header'
        continue
      }

      if (state === 'header') {
        const end = buf.indexOf(Buffer.from('\r\n\r\n'))
        if (end === -1) {
          if (buf.length > 64 * 1024) {
            source.destroy()
            w.destroy()
            throw new Error('INVALID_HEADER')
          }
          return buf
        }
        const header = buf.subarray(0, end)
        buf = buf.subarray(end + 4)
        const nameMatch = header.toString('utf8').match(/form-data;\s*name="([^"]+)"/i)
        currentName = nameMatch ? nameMatch[1] : null
        inFile = currentName === 'file' && /filename="[^"]*"/i.test(header.toString('utf8'))
        state = 'data'
        continue
      }

      // data：寻找下一边界 `\r\n--boundary`
      const idx = buf.indexOf(MARKER)
      if (idx === -1) {
        const keep = Math.min(buf.length, KEEP)
        const body = buf.subarray(0, buf.length - (buf.length > keep ? keep : 0))
        if (body.length) {
          if (inFile) {
            await writeBytes(body)
          } else if (currentName === 'options') {
            optionsBuf = optionsBuf ? Buffer.concat([optionsBuf, body]) : Buffer.from(body)
            if (optionsBuf.length > MAX_FIELD_BYTES) throw new Error('FIELD_TOO_LARGE')
          }
        }
        return keep >= buf.length ? buf : buf.subarray(buf.length - keep)
      }

      const body = buf.subarray(0, idx)
      if (inFile) {
        await writeBytes(body)
      } else if (currentName === 'options') {
        optionsBuf = optionsBuf ? Buffer.concat([optionsBuf, body]) : Buffer.from(body)
        if (optionsBuf.length > MAX_FIELD_BYTES) throw new Error('FIELD_TOO_LARGE')
      }
      buf = buf.subarray(idx)
      state = 'preface'
    }
    return buf
  }

  try {
    for await (const chunk of source) {
      buf = buf.length ? Buffer.concat([buf, chunk]) : Buffer.from(chunk)
      buf = await consume()
      if (phaseNow() === 'done') break
    }
    // 流自然结束时，若有残留的尾部 data（畸形包未带结尾边界），补齐写入
    await consume()
    if (phaseNow() === 'data' && buf.length) {
      if (inFile) await writeBytes(buf)
      else if (currentName === 'options') {
        optionsBuf = optionsBuf ? Buffer.concat([optionsBuf, buf]) : Buffer.from(buf)
      }
    }
  } catch (err) {
    source.destroy()
    w.destroy()
    await cleanup()
    throw err
  } finally {
    await new Promise<void>((resolve) => {
      if (w.destroyed) resolve()
      else w.end(resolve)
    }).catch(() => undefined)
  }

  return {
    filePath,
    fileSize,
    optionsRaw: optionsBuf ? optionsBuf.toString('utf8') : undefined,
    cleanup,
  }
}
