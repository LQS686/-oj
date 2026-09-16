/**
 * /api/setup/restore - 部署引导页「从备份恢复」（公开，仅空库可用）
 *
 * 与 /api/admin/restore/upload 共享 restoreFromArchive 引擎，但：
 *  - 仅当数据库为空（needsBootstrap）时放行，防止占用/覆盖已有站点。
 *  - 空库无需确认覆盖，也不必做恢复前快照。
 *  - real-time 以 NDJSON 流返回进度与结果（含可选解密后的密钥）。
 */
import { errorLike, throw400, fail } from '@/lib/api/withApi'
import { parseMultipartFromRequest } from '@/lib/http/multipart'
import { getBackupConfig } from '@/lib/backup/config'
import { restoreFromArchive, isDatabaseEmpty } from '@/lib/backup/restore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = async (req: Request) => {
  const contentType = req.headers.get('content-type') || ''
  if (!contentType.includes('multipart/form-data')) {
    throw400('INVALID_CONTENT_TYPE', '请求必须是 multipart/form-data')
  }

  if (!(await isDatabaseEmpty())) {
    return fail('ALREADY_BOOTSTRAPPED', '站点已初始化，无法通过部署引导页恢复', 403)
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
  let passphrase: string | undefined
  if (optionsPart) {
    try {
      const options = JSON.parse(optionsPart.data.toString('utf8')) as { passphrase?: string }
      passphrase = typeof options.passphrase === 'string' ? options.passphrase : undefined
    } catch {
      throw400('INVALID_OPTIONS', 'options 不是合法 JSON')
    }
  }

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
          const result = await restoreFromArchive({
            buffer: file.data,
            passphrase,
            onProgress: (p) => write(JSON.stringify({ type: 'progress', ...p })),
          })
          write(JSON.stringify({ type: 'done', result }))
        } catch (err) {
          write(JSON.stringify({ type: 'error', message: errorLike(err).message || '恢复失败' }))
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
}
