/**
 * lib/problem/import/execute.ts
 * 题库批量导入执行入口（供 API 路由与自定义 server 直通共用）
 */
import { ApiError } from '@/lib/api/withApi'
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
  type ImportBatchResult,
} from '@/lib/problem/import'

export const VALID_IMPORT_FORMATS: ImportFormat[] = [
  'fps',
  'hydro',
  'syzoj',
  'csv',
  'codeforces',
  'dsoj',
]
const VALID_DUPLICATE_POLICIES = ['skip', 'overwrite', 'duplicate'] as const
const VALID_VISIBILITIES = ['public', 'private', 'contest'] as const

/** 导入文件大小上限：50MB */
export const IMPORT_MAX_FILE_BYTES = 50 * 1024 * 1024

export function parseImportOptions(raw: unknown, authorId: string): ImportOptions {
  const opts = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>
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
    result.cfRatingRange = opts.cfRatingRange as [number, number]
  }
  if (typeof opts.cfLimit === 'number' && opts.cfLimit > 0) {
    result.cfLimit = Math.min(opts.cfLimit, 500)
  }

  return result
}

export async function parseImportByFormat(
  format: ImportFormat,
  content: string | Buffer,
  options: ImportOptions
): Promise<ImportedProblem[]> {
  switch (format) {
    case 'fps':
      return parseFps(typeof content === 'string' ? content : content.toString('utf-8'))
    case 'hydro': {
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
      const buf = typeof content === 'string' ? Buffer.from(content) : content
      if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
        throw new ApiError('INVALID_DSOJ_FORMAT', 'DSOJ 标准格式必须是 ZIP 文件', 400)
      }
      return parseDsojZip(buf)
    }
    default:
      throw new ApiError('INVALID_FORMAT', `不支持的格式: ${format}`, 400)
  }
}

export interface ExecuteImportInput {
  format: ImportFormat
  /** 文件/文本内容；codeforces 可为 null */
  content: string | Buffer | null
  rawOptions: unknown
  authorId: string
}

export interface ExecuteImportResult extends ImportBatchResult {
  format: ImportFormat
  message: string
}

/**
 * 解析并写入题库
 */
export async function executeProblemImport(
  input: ExecuteImportInput
): Promise<ExecuteImportResult> {
  const { format, content, rawOptions, authorId } = input
  if (!VALID_IMPORT_FORMATS.includes(format)) {
    throw new ApiError(
      'INVALID_FORMAT',
      `缺少或无效的 format 参数，支持: ${VALID_IMPORT_FORMATS.join(', ')}`,
      400
    )
  }

  const options = parseImportOptions(rawOptions, authorId)

  if (format !== 'codeforces' && (content == null || content === '')) {
    throw new ApiError('NO_CONTENT', '缺少导入内容', 400)
  }

  const importedProblems =
    format === 'codeforces'
      ? await parseImportByFormat(format, '', options)
      : await parseImportByFormat(format, content ?? '', options)

  if (importedProblems.length === 0) {
    return {
      total: 0,
      created: 0,
      skipped: 0,
      failed: 0,
      results: [],
      format,
      message: '解析完成但未找到任何题目',
    }
  }

  const result = await importProblems(importedProblems, options)
  return {
    ...result,
    format,
    message: `成功导入 ${result.created} 题${result.skipped > 0 ? `，跳过 ${result.skipped} 题` : ''}${result.failed > 0 ? `，失败 ${result.failed} 题` : ''}`,
  }
}
