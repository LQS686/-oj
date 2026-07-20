/**
 * /api/admin/problems/import - 批量导入题库（管理员）
 *
 * 支持三种请求方式：
 *   1. multipart/form-data：上传文件 + 格式参数（FPS / Hydro ZIP / SYZOJ JSON / CSV / DSOJ ZIP）
 *   2. application/json：直接传文本内容 + 格式参数（适合 FPS XML/JSON、SYZOJ JSON、CSV）
 *   3. application/json + format=codeforces：触发 Codeforces API 同步
 *
 * 请求体示例（JSON）：
 *   {
 *     "format": "fps" | "hydro" | "syzoj" | "csv" | "codeforces" | "dsoj",
 *     "content": "...",           // FPS/JSON/CSV 文本内容（codeforces 不需要）
 *     "options": {
 *       "onDuplicate": "skip" | "overwrite" | "duplicate",
 *       "visibility": "public" | "private" | "contest",
 *       "defaultDifficulty": "入门" | ...,
 *       "cfTags": ["dp"],          // codeforces 专用
 *       "cfRatingRange": [800, 1500], // codeforces 专用
 *       "cfLimit": 100              // codeforces 专用
 *     }
 *   }
 */
import { withApi, ok, throw400 } from '@/lib/api/withApi'
import { isValidDifficulty } from '@/lib/constants'
import {
  parseFps,
  parseHydroZip,
  parseHydroJson,
  parseSyzojJson,
  parseCsvProblems,
  fetchCodeforcesProblems,
  parseDsojZip,
  importProblems,
  type ImportFormat,
  type ImportOptions,
  type ImportedProblem,
} from '@/lib/problem/import'

export const dynamic = 'force-dynamic'

const VALID_FORMATS: ImportFormat[] = ['fps', 'hydro', 'syzoj', 'csv', 'codeforces', 'dsoj']
const VALID_DUPLICATE_POLICIES = ['skip', 'overwrite', 'duplicate']
const VALID_VISIBILITIES = ['public', 'private', 'contest']

/**
 * 解析并校验导入选项
 */
function parseOptions(raw: any, authorId: string): ImportOptions {
  const opts = raw || {}
  const onDuplicate = VALID_DUPLICATE_POLICIES.includes(opts.onDuplicate)
    ? opts.onDuplicate
    : 'skip'
  const visibility = VALID_VISIBILITIES.includes(opts.visibility)
    ? opts.visibility
    : 'private'
  const defaultDifficulty = isValidDifficulty(opts.defaultDifficulty)
    ? opts.defaultDifficulty
    : '入门'

  const result: ImportOptions = {
    onDuplicate,
    visibility,
    defaultDifficulty,
    authorId,
  }

  if (Array.isArray(opts.cfTags)) {
    result.cfTags = opts.cfTags.filter((t: unknown) => typeof t === 'string') as string[]
  }
  if (
    Array.isArray(opts.cfRatingRange) &&
    opts.cfRatingRange.length === 2 &&
    typeof opts.cfRatingRange[0] === 'number' &&
    typeof opts.cfRatingRange[1] === 'number'
  ) {
    result.cfRatingRange = opts.cfRatingRange
  }
  if (typeof opts.cfLimit === 'number' && opts.cfLimit > 0) {
    result.cfLimit = Math.min(opts.cfLimit, 500)
  }

  return result
}

/**
 * 根据格式 + 内容解析为 ImportedProblem[]
 */
async function parseByFormat(
  format: ImportFormat,
  content: string | Buffer,
  options: ImportOptions
): Promise<ImportedProblem[]> {
  switch (format) {
    case 'fps':
      return parseFps(typeof content === 'string' ? content : content.toString('utf-8'))
    case 'hydro': {
      // 如果是 ZIP（PK 头）走 ZIP 解析，否则按 JSON 处理
      const buf = typeof content === 'string' ? Buffer.from(content) : content
      if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b) {
        return parseHydroZip(buf)
      }
      return parseHydroJson(buf.toString('utf-8'))
    }
    case 'syzoj':
      return parseSyzojJson(
        typeof content === 'string' ? content : content.toString('utf-8')
      )
    case 'csv':
      return parseCsvProblems(
        typeof content === 'string' ? content : content.toString('utf-8')
      )
    case 'codeforces':
      return fetchCodeforcesProblems({
        tags: options.cfTags,
        ratingRange: options.cfRatingRange,
        limit: options.cfLimit ?? 100,
      })
    case 'dsoj': {
      // DSOJ 标准格式必须是 ZIP
      const buf = typeof content === 'string' ? Buffer.from(content) : content
      if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
        throw400('INVALID_DSOJ_FORMAT', 'DSOJ 标准格式必须是 ZIP 文件')
      }
      return parseDsojZip(buf)
    }
    default:
      throw400('INVALID_FORMAT', `不支持的格式: ${format}`)
      // unreachable: throw400 returns never，但 TS 控制流分析需要显式终止
      throw new Error('unreachable')
  }
}

export const POST = withApi.admin(async (req, _ctx, { user }) => {
  const contentType = req.headers.get('content-type') || ''

  let format: ImportFormat
  let rawOptions: any
  let content: string | Buffer | null = null

  if (contentType.includes('multipart/form-data')) {
    // 文件上传模式
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const formatStr = formData.get('format') as string | null
    const optionsStr = formData.get('options') as string | null

    if (!formatStr) throw400('NO_FORMAT', '缺少 format 参数')
    const fmt = formatStr as ImportFormat
    if (!VALID_FORMATS.includes(fmt)) {
      throw400('INVALID_FORMAT', `不支持的格式: ${fmt}`)
    }
    format = fmt

    // Codeforces 不需要文件
    if (format === 'codeforces') {
      rawOptions = optionsStr ? JSON.parse(optionsStr) : {}
    } else {
      if (!file) throw400('NO_FILE', '未选择文件')
      // 限制文件大小 50MB
      if (file!.size > 50 * 1024 * 1024) {
        throw400('FILE_TOO_LARGE', '文件大小超过 50MB 限制')
      }
      const arrayBuffer = await file!.arrayBuffer()
      content = Buffer.from(arrayBuffer)
      rawOptions = optionsStr ? JSON.parse(optionsStr) : {}
    }
  } else {
    // JSON 模式
    const body = await req.json().catch(() => null)
    if (!body) throw400('INVALID_JSON', '请求体不是合法 JSON')

    const fmt = body.format as ImportFormat
    if (!fmt || !VALID_FORMATS.includes(fmt)) {
      throw400(
        'INVALID_FORMAT',
        `缺少或无效的 format 参数，支持: ${VALID_FORMATS.join(', ')}`
      )
    }
    format = fmt
    if (format !== 'codeforces' && !body.content) {
      throw400('NO_CONTENT', '缺少 content 字段')
    }
    content = body.content ?? null
    rawOptions = body.options || {}
  }

  const options = parseOptions(rawOptions, user.id)

  // Codeforces 模式无 content
  const importedProblems =
    format === 'codeforces'
      ? await parseByFormat(format, '', options)
      : await parseByFormat(format, content ?? '', options)

  if (importedProblems.length === 0) {
    return ok({
      total: 0,
      created: 0,
      skipped: 0,
      failed: 0,
      results: [],
      message: '解析完成但未找到任何题目',
    })
  }

  const result = await importProblems(importedProblems, options)

  return ok({
    ...result,
    format,
    message: `成功导入 ${result.created} 题${result.skipped > 0 ? `，跳过 ${result.skipped} 题` : ''}${result.failed > 0 ? `，失败 ${result.failed} 题` : ''}`,
  })
})
