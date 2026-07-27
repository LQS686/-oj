/**
 * /api/admin/problems/import - 批量导入题库（管理员）
 *
 * 支持三种请求方式：
 *   1. multipart/form-data：上传文件 + 格式参数（FPS / Hydro ZIP / SYZOJ JSON / CSV / DSOJ ZIP）
 *   2. application/json：直接传文本内容 + 格式参数
 *   3. application/json + format=codeforces：触发 Codeforces API 同步
 *
 * 注意：自定义 server 下大体积 multipart 会触发 Next.js
 * 「Response body object should not be disturbed or locked」。
 * 因此 multipart 一律用 arrayBuffer + 自解析，且 server.ts 会对本路径做直通。
 */
import { withApi, ok, throw400 } from '@/lib/api/withApi'
import {
  executeProblemImport,
  VALID_IMPORT_FORMATS,
  IMPORT_MAX_FILE_BYTES,
  type ImportFormat,
} from '@/lib/problem/import'
import {
  parseMultipartFromRequest,
} from '@/lib/http/multipart'

export const dynamic = 'force-dynamic'

export const POST = withApi.admin(async (req, _ctx, { user }) => {
  const contentType = req.headers.get('content-type') || ''

  let format: ImportFormat
  let rawOptions: unknown = {}
  let content: string | Buffer | null = null

  if (contentType.includes('multipart/form-data')) {
    let parts: Awaited<ReturnType<typeof parseMultipartFromRequest>>
    try {
      parts = await parseMultipartFromRequest(req, IMPORT_MAX_FILE_BYTES + 1024 * 1024)
    } catch (e: any) {
      const msg = e?.message || ''
      if (msg === 'PAYLOAD_TOO_LARGE') throw400('FILE_TOO_LARGE', '文件大小超过 50MB 限制')
      if (msg === 'INVALID_CONTENT_TYPE') throw400('INVALID_CONTENT_TYPE', '请求必须是 multipart/form-data')
      if (msg === 'INVALID_BOUNDARY') throw400('INVALID_BOUNDARY', 'multipart boundary 缺失')
      throw400('MULTIPART_PARSE_FAILED', 'multipart 解析失败')
      return ok({}) // unreachable
    }

    const formatPart = parts.find((p) => p.name === 'format')
    const optionsPart = parts.find((p) => p.name === 'options')

    const formatStr = formatPart?.data.toString('utf8').trim() || ''
    if (!formatStr) throw400('NO_FORMAT', '缺少 format 参数')
    if (!(VALID_IMPORT_FORMATS as string[]).includes(formatStr)) {
      throw400('INVALID_FORMAT', `不支持的格式: ${formatStr}`)
    }
    format = formatStr as ImportFormat

    if (optionsPart) {
      try {
        rawOptions = JSON.parse(optionsPart.data.toString('utf8'))
      } catch {
        throw400('INVALID_OPTIONS', 'options 不是合法 JSON')
      }
    }

    if (format !== 'codeforces') {
      const file = parts.find((p) => p.name === 'file')
      if (!file || file.data.length === 0) {
        throw400('NO_FILE', '未选择文件')
        throw new Error('unreachable')
      }
      if (file.data.length > IMPORT_MAX_FILE_BYTES) {
        throw400('FILE_TOO_LARGE', '文件大小超过 50MB 限制')
        throw new Error('unreachable')
      }
      content = file.data
    }
  } else {
    const body = await req.json().catch(() => null)
    if (!body) throw400('INVALID_JSON', '请求体不是合法 JSON')

    const fmt = body.format as ImportFormat
    if (!fmt || !(VALID_IMPORT_FORMATS as string[]).includes(fmt)) {
      throw400(
        'INVALID_FORMAT',
        `缺少或无效的 format 参数，支持: ${VALID_IMPORT_FORMATS.join(', ')}`
      )
    }
    format = fmt
    if (format !== 'codeforces' && !body.content) {
      throw400('NO_CONTENT', '缺少 content 字段')
    }
    content = body.content ?? null
    rawOptions = body.options || {}
  }

  const result = await executeProblemImport({
    format,
    content,
    rawOptions,
    authorId: user.id,
  })

  return ok(result)
})
