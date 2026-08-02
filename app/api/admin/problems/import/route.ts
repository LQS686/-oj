/**
 * /api/admin/problems/import - 批量导入题库（管理员）
 *
 * 仅支持 DSOJ 标准题包（ZIP / tar.xz），multipart/form-data 上传文件。
 * 成功路径以 NDJSON 流返回导入进度：
 *   {"type":"meta","total":50}
 *   {"type":"item","index":0,"result":{status,title,problemNumber?,reason?}}
 *   ...
 *   {"type":"done","summary":{total,created,skipped,failed,message}}
 * 解析前致命错误（非 DSOJ 格式 / 文件超限 / 权限不足等）以 JSON 错误响应返回，
 * 由前端根据 Content-Type 区分处理。
 */
import { withApi, throw400, errorLike } from '@/lib/api/withApi'
import {
  prepareProblemImport,
  executeProblemImportStream,
  IMPORT_MAX_FILE_BYTES,
} from '@/lib/problem/import'
import { parseMultipartFromRequest } from '@/lib/http/multipart'

export const dynamic = 'force-dynamic'

export const POST = withApi.admin(async (req, _ctx, { user }) => {
  const contentType = req.headers.get('content-type') || ''
  if (!contentType.includes('multipart/form-data')) {
    throw400('INVALID_CONTENT_TYPE', '请求必须是 multipart/form-data')
  }

  let parts: Awaited<ReturnType<typeof parseMultipartFromRequest>>
  try {
    parts = await parseMultipartFromRequest(req, IMPORT_MAX_FILE_BYTES + 1024 * 1024, {
      maxPartBytes: IMPORT_MAX_FILE_BYTES,
    })
  } catch (e: unknown) {
    const msg = errorLike(e).message || ''
    if (msg === 'PAYLOAD_TOO_LARGE' || msg === 'PART_TOO_LARGE') {
      throw400('FILE_TOO_LARGE', '文件大小超过 50MB 限制')
    }
    if (msg === 'INVALID_CONTENT_TYPE') throw400('INVALID_CONTENT_TYPE', '请求必须是 multipart/form-data')
    if (msg === 'INVALID_BOUNDARY') throw400('INVALID_BOUNDARY', 'multipart boundary 缺失')
    if (msg === 'TOO_MANY_PARTS') throw400('TOO_MANY_PARTS', '表单字段过多')
    throw400('MULTIPART_PARSE_FAILED', 'multipart 解析失败')
    return new Response(null) // unreachable
  }

  // format 参数可选，提供时必须为 dsoj
  const formatPart = parts.find((p) => p.name === 'format')
  const formatStr = formatPart?.data.toString('utf8').trim() || 'dsoj'
  if (formatStr !== 'dsoj') {
    throw400('INVALID_FORMAT', '仅支持 DSOJ 标准题包导入（format=dsoj）')
  }

  const optionsPart = parts.find((p) => p.name === 'options')
  let rawOptions: unknown = {}
  if (optionsPart) {
    try {
      rawOptions = JSON.parse(optionsPart.data.toString('utf8'))
    } catch {
      throw400('INVALID_OPTIONS', 'options 不是合法 JSON')
    }
  }

  const file = parts.find((p) => p.name === 'file')
  if (!file || file.data.length === 0) {
    throw400('NO_FILE', '未选择文件')
    throw new Error('unreachable')
  }
  if (file.data.length > IMPORT_MAX_FILE_BYTES) {
    throw400('FILE_TOO_LARGE', '文件大小超过 50MB 限制')
  }

  // 解析前置：全局错误（非法格式等）在此抛出 → withApi 转 JSON 错误响应
  const prepared = await prepareProblemImport({
    format: 'dsoj',
    content: file.data,
    rawOptions,
    authorId: user.id,
  })

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (line: string) => {
        try {
          controller.enqueue(encoder.encode(line + '\n'))
        } catch {
          /* 客户端断开时忽略 */
        }
      }
      void (async () => {
        try {
          await executeProblemImportStream(prepared, (event) => {
            write(JSON.stringify(event))
          })
        } catch (err) {
          const msg = errorLike(err).message || '导入失败'
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
