/**
 * /api/admin/restore/upload - 从本地上传备份包恢复（系统管理员）
 *
 * multipart/form-data，字段：
 *   file       .dsoj.gz 备份包
 *   options    JSON：{ passphrase?: string, allowOverwrite?: boolean }
 *
 * file 部件流式落盘到临时文件（不载入内存），恢复从临时文件流式读取，兼容大备份包。
 * 成功路径以 NDJSON 流返回进度：
 *   {"type":"meta","total":...}
 *   {"type":"progress","stage":...}
 *   {"type":"done","result":{...}}
 * 解析前致命错误以 JSON 错误响应返回；恢复期错误以 NDJSON error 行返回。
 */
import { withApi, throw400, errorLike } from '@/lib/api/withApi'
import { getBackupConfig } from '@/lib/backup/config'
import { uploadBackupToTemp, type BackupUploadResult } from '@/lib/backup/restore-upload'
import { restoreFromArchive } from '@/lib/backup/restore'
import { guardLargeUploadRequest } from '@/lib/security/csrf'
import { restoreRateLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RestoreOptions {
  passphrase?: string
  allowOverwrite?: boolean
}

export const POST = withApi.systemAdmin(async (req) => {
  // 本路由为保持大包请求体真流式，已被移出全局 proxy matcher；
  // 在此显式执行与全局中间件等价的同源校验（双提交 Cookie 已由 withApi 校验，
  // 同源层因移出 matcher 需补回，保证与 /api/setup/restore 一致）。
  const csrfErr = guardLargeUploadRequest(req)
  if (csrfErr) return csrfErr

  // 移出 matcher 后不再走 middleware 全局限流，路由内显式恢复（按 IP）。
  // 注意：restoreRateLimiter 是 async（返回 Promise<NextResponse|null>），必须 await，
  // 否则 `if (rl)` 对 Promise 恒为真 → 路由会提前 return，恢复逻辑永不执行。
  const rl = await restoreRateLimiter(req as NextRequest)
  if (rl) return rl

  const contentType = req.headers.get('content-type') || ''
  if (!contentType.includes('multipart/form-data')) {
    throw400('INVALID_CONTENT_TYPE', '请求必须是 multipart/form-data')
  }
  const cfg = getBackupConfig()
  const maxBytes = cfg.maxSizeMb * 1024 * 1024

  // 流式落盘到临时文件（内存恒定）。体积超限在此阶段强制。
  let upload: BackupUploadResult
  try {
    upload = await uploadBackupToTemp(req, maxBytes)
  } catch (e: unknown) {
    const msg = errorLike(e).message || ''
    if (msg === 'PAYLOAD_TOO_LARGE' || msg === 'PART_TOO_LARGE' || msg === 'FIELD_TOO_LARGE') {
      return throw400('FILE_TOO_LARGE', `备份包大小超过 ${cfg.maxSizeMb}MB 限制`)
    }
    return throw400('MULTIPART_PARSE_FAILED', '备份包解析失败')
  }
  if (upload.fileSize === 0) {
    await upload.cleanup()
    return throw400('NO_FILE', '未选择文件')
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (line: string) => {
        try {
          controller.enqueue(encoder.encode(line + '\n'))
        } catch {
          /* 客户端断开 */
        }
      }
      void (async () => {
        try {
          let options: RestoreOptions = {}
          if (upload.optionsRaw) {
            try {
              options = JSON.parse(upload.optionsRaw) as RestoreOptions
            } catch {
              write(JSON.stringify({ type: 'error', message: 'options 不是合法 JSON' }))
              return
            }
          }
          const passphrase = typeof options.passphrase === 'string' ? options.passphrase : undefined

          // 恢复是破坏性操作：必须显式确认「覆盖现有数据」
          if (options.allowOverwrite !== true) {
            write(
              JSON.stringify({
                type: 'error',
                message: '恢复会覆盖当前数据，请勾选「我已了解并确认覆盖」后再执行',
              })
            )
            return
          }

          const result = await restoreFromArchive({
            filePath: upload.filePath,
            passphrase,
            onProgress: (p) => write(JSON.stringify({ type: 'progress', ...p })),
          })
          write(JSON.stringify({ type: 'done', result }))
        } catch (err) {
          const msg = errorLike(err).message || '恢复失败'
          logger.error('[restore] 恢复失败', { error: msg })
          write(JSON.stringify({ type: 'error', message: msg }))
        } finally {
          // 恢复完成（成功/失败）后删除临时文件
          await upload.cleanup()
          try {
            controller.close()
          } catch {
            /* ignore */
          }
        }
      })()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  })
})
