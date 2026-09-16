/**
 * /api/admin/restore/upload - 从本地上传备份包恢复（系统管理员）
 *
 * multipart/form-data，字段：
 *   file       .dsoj.gz 备份包
 *   options    JSON：{ passphrase?: string, allowOverwrite?: boolean }
 * 成功路径以 NDJSON 流返回进度：
 *   {"type":"meta","total":...}
 *   {"type":"progress","stage":...}
 *   {"type":"done","result":{...}}
 * 解析前致命错误以 JSON 错误响应返回。
 */
import { withApi, throw400, errorLike } from '@/lib/api/withApi'
import { parseMultipartFromRequest } from '@/lib/http/multipart'
import { getBackupConfig } from '@/lib/backup/config'
import { restoreFromArchive } from '@/lib/backup/restore'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = withApi.systemAdmin(async (req) => {
  const contentType = req.headers.get('content-type') || ''
  if (!contentType.includes('multipart/form-data')) {
    throw400('INVALID_CONTENT_TYPE', '请求必须是 multipart/form-data')
  }
  const cfg = getBackupConfig()
  const maxBytes = cfg.maxSizeMb * 1024 * 1024

  let parts: Awaited<ReturnType<typeof parseMultipartFromRequest>>
  try {
    parts = await parseMultipartFromRequest(req, maxBytes + 1024 * 1024, {
      maxPartBytes: maxBytes,
    })
  } catch (e: unknown) {
    const msg = errorLike(e).message || ''
    if (msg === 'PAYLOAD_TOO_LARGE' || msg === 'PART_TOO_LARGE') {
      return throw400('FILE_TOO_LARGE', `备份包大小超过 ${cfg.maxSizeMb}MB 限制`)
    }
    return throw400('MULTIPART_PARSE_FAILED', '备份包解析失败')
  }

  const optionsPart = parts.find((p) => p.name === 'options')
  let options: { passphrase?: string; allowOverwrite?: boolean } = {}
  if (optionsPart) {
    try {
      options = JSON.parse(optionsPart.data.toString('utf8'))
    } catch {
      throw400('INVALID_OPTIONS', 'options 不是合法 JSON')
    }
  }
  const passphrase = typeof options.passphrase === 'string' ? options.passphrase : undefined

  const file = parts.find((p) => p.name === 'file')
  if (!file) return throw400('NO_FILE', '未选择文件')
  if (file.data.length === 0) return throw400('NO_FILE', '未选择文件')
  if (file.data.length > maxBytes) {
    return throw400('FILE_TOO_LARGE', `备份包大小超过 ${cfg.maxSizeMb}MB 限制`)
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
            buffer: file.data,
            passphrase,
            onProgress: (p) => write(JSON.stringify({ type: 'progress', ...p })),
          })
          write(JSON.stringify({ type: 'done', result }))
        } catch (err) {
          const msg = errorLike(err).message || '恢复失败'
          logger.error('[restore] 恢复失败', { error: msg })
          write(JSON.stringify({ type: 'error', message: msg }))
        } finally {
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
