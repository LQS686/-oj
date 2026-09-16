/**
 * /api/setup/restore - 部署引导页「从备份恢复」（公开，仅空库可用）
 *
 * 与 /api/admin/restore/upload 共享 restoreFromArchive 引擎，但：
 *  - 仅当数据库为空（needsBootstrap）时放行，防止占用/覆盖已有站点。
 *  - 空库无需确认覆盖，也不必做恢复前快照。
 *  - real-time 以 NDJSON 流返回进度与结果（含可选解密后的密钥）。
 *  - file 部件流式落盘临时文件，从临时文件流式恢复，兼容大备份包。
 */
import { errorLike, fail } from '@/lib/api/withApi'
import { getBackupConfig } from '@/lib/backup/config'
import { uploadBackupToTemp, type BackupUploadResult } from '@/lib/backup/restore-upload'
import { restoreFromArchive, isDatabaseEmpty } from '@/lib/backup/restore'
import { guardLargeUploadRequest } from '@/lib/security/csrf'
import { restoreRateLimiter } from '@/lib/rate-limit'
import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = async (req: Request) => {
  const contentType = req.headers.get('content-type') || ''
  // 本路由为裸 handler（未包 withApi），必须 return 统一错误响应；
  // 若 throw ApiError 会冒泡到 server.ts 兜底并返回 500，丢失 400/413 语义。
  if (!contentType.includes('multipart/form-data')) {
    return fail('INVALID_CONTENT_TYPE', '请求必须是 multipart/form-data', 400)
  }

  // 本路由为保持大包请求体真流式，已被移出全局 proxy matcher；
  // 故在此显式执行与全局中间件等价的同源 + 双提交 Cookie CSRF 校验。
  const csrfErr = guardLargeUploadRequest(req)
  if (csrfErr) return csrfErr

  // 移出 matcher 后不再走 middleware 全局限流；本路由为公开路由，路由内显式恢复，
  // 防止空库阶段被反复上传大包打满磁盘。
  // 注意：restoreRateLimiter 是 async（返回 Promise<NextResponse|null>），必须 await，
  // 否则 `if (rl)` 对 Promise 恒为真 → 路由会在校验前提前 return，恢复逻辑永不执行。
  const rl = await restoreRateLimiter(req as unknown as NextRequest)
  if (rl) return rl

  if (!(await isDatabaseEmpty())) {
    return fail('ALREADY_BOOTSTRAPPED', '站点已初始化，无法通过部署引导页恢复', 403)
  }

  const cfg = getBackupConfig()
  const maxBytes = cfg.maxSizeMb * 1024 * 1024

  let upload: BackupUploadResult
  try {
    upload = await uploadBackupToTemp(req, maxBytes)
  } catch (e: unknown) {
    const msg = errorLike(e).message || ''
    if (msg === 'PAYLOAD_TOO_LARGE' || msg === 'PART_TOO_LARGE' || msg === 'FIELD_TOO_LARGE') {
      return fail('FILE_TOO_LARGE', `备份包大小超过 ${cfg.maxSizeMb}MB 限制`, 413)
    }
    return fail('MULTIPART_PARSE_FAILED', '备份包解析失败', 400)
  }
  if (upload.fileSize === 0) {
    await upload.cleanup()
    return fail('NO_FILE', '未选择文件', 400)
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
          let passphrase: string | undefined
          if (upload.optionsRaw) {
            try {
              const options = JSON.parse(upload.optionsRaw) as { passphrase?: string }
              passphrase = typeof options.passphrase === 'string' ? options.passphrase : undefined
            } catch {
              write(JSON.stringify({ type: 'error', message: 'options 不是合法 JSON' }))
              return
            }
          }

          const result = await restoreFromArchive({
            filePath: upload.filePath,
            passphrase,
            onProgress: (p) => write(JSON.stringify({ type: 'progress', ...p })),
          })
          write(JSON.stringify({ type: 'done', result }))
        } catch (err) {
          write(JSON.stringify({ type: 'error', message: errorLike(err).message || '恢复失败' }))
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
}
