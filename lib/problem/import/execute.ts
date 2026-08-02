/**
 * lib/problem/import/execute.ts
 * 题库批量导入执行入口（供 API 路由与自定义 server 直通共用）
 *
 * 仅支持 DSOJ 标准题包导入（ZIP / tar.xz）：
 *   - prepareProblemImport：解析前置，全局错误在此抛出（路由可在创建流式 Response 之前 await）
 *   - executeProblemImportStream：流式导入（meta → 逐题 item → done），供 NDJSON 流写出
 */
import { ApiError } from '@/lib/api/errors'
import { isValidDifficulty } from '@/lib/constants'
import AdmZip from 'adm-zip'
import { logger } from '@/lib/logger'
import { importOneProblem } from './service'
import {
  parseDsojArchiveDetailed,
  type ArchiveLike,
  type DsojParseJobResult,
} from './dsoj-parser'
import {
  parseTarXzBuffer,
  detectArchiveFormat,
} from './tarxz-archive'
import type {
  ImportFormat,
  ImportOptions,
  ImportedProblemResult,
  ImportStreamEvent,
} from './types'

export const VALID_IMPORT_FORMATS: ImportFormat[] = ['dsoj']
const VALID_DUPLICATE_POLICIES = ['skip', 'overwrite', 'duplicate'] as const
const VALID_VISIBILITIES = ['public', 'private', 'contest'] as const

/** 导入文件大小上限：50MB */
export const IMPORT_MAX_FILE_BYTES = 50 * 1024 * 1024

export function parseImportOptions(raw: unknown, authorId: string): ImportOptions {
  const opts = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const onDuplicateRaw = opts.onDuplicate
  const onDuplicate =
    typeof onDuplicateRaw === 'string' &&
    (VALID_DUPLICATE_POLICIES as readonly string[]).includes(onDuplicateRaw)
      ? (onDuplicateRaw as (typeof VALID_DUPLICATE_POLICIES)[number])
      : 'skip'
  const visibilityRaw = opts.visibility
  const visibility =
    typeof visibilityRaw === 'string' &&
    (VALID_VISIBILITIES as readonly string[]).includes(visibilityRaw)
      ? (visibilityRaw as (typeof VALID_VISIBILITIES)[number])
      : 'private'
  const defaultDifficulty = isValidDifficulty(opts.defaultDifficulty)
    ? opts.defaultDifficulty
    : '入门'

  return {
    onDuplicate,
    visibility,
    defaultDifficulty,
    authorId,
  }
}

export interface PreparedProblemImport {
  jobs: DsojParseJobResult[]
  options: ImportOptions
}

/**
 * 解析前置：校验 format / 内容非空，解压 zip 或 tar.xz 并逐题解析。
 * 全局错误（非法格式、格式不匹配、安全校验失败、无任何题目目录）在此抛出；
 * 单题解析失败不会抛出，而是进入 jobs 的失败项。
 */
export async function prepareProblemImport(
  input: ExecuteImportInput
): Promise<PreparedProblemImport> {
  const { format, content, rawOptions, authorId } = input
  if (format !== 'dsoj') {
    throw new ApiError('INVALID_FORMAT', '仅支持 DSOJ 标准题包导入（format=dsoj）', 400)
  }
  if (content == null || content === '') {
    throw new ApiError('NO_CONTENT', '缺少导入内容', 400)
  }
  const options = parseImportOptions(rawOptions, authorId)
  const buf = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content
  const kind = detectArchiveFormat(buf)
  let archive: ArchiveLike
  if (kind === 'tar.xz') {
    archive = await parseTarXzBuffer(buf)
  } else if (kind === 'zip') {
    archive = new AdmZip(buf) as unknown as ArchiveLike
  } else {
    throw new ApiError('INVALID_DSOJ_FORMAT', 'DSOJ 标准格式必须是 ZIP 或 tar.xz 文件', 400)
  }
  const jobs = parseDsojArchiveDetailed(archive)
  return { jobs, options }
}

/**
 * 流式导入：meta → 逐题 item（解析失败项直接以 failed 结果输出）→ done。
 * 供 API 路由与自定义 server 以 NDJSON 流写出。
 */
export async function executeProblemImportStream(
  prepared: PreparedProblemImport,
  onEvent: (event: ImportStreamEvent) => void
): Promise<void> {
  const { jobs, options } = prepared
  onEvent({ type: 'meta', total: jobs.length })

  const results: ImportedProblemResult[] = []
  for (const job of jobs) {
    const result: ImportedProblemResult = job.ok
      ? await importOneProblem(job.problem, options)
      : {
          status: 'failed',
          title: job.title || job.dir,
          externalId: job.dir,
          reason: job.reason,
        }
    results.push(result)
    onEvent({ type: 'item', index: job.index, result })
  }

  const created = results.filter((r) => r.status === 'created').length
  const skipped = results.filter((r) => r.status === 'skipped').length
  const failed = results.filter((r) => r.status === 'failed').length

  logger.info(
    `[import] 流式导入完成：共 ${jobs.length} 题，新建 ${created}，跳过 ${skipped}，失败 ${failed}`
  )

  onEvent({
    type: 'done',
    summary: {
      total: jobs.length,
      created,
      skipped,
      failed,
      message: `成功导入 ${created} 题${skipped > 0 ? `，跳过 ${skipped} 题` : ''}${failed > 0 ? `，失败 ${failed} 题` : ''}`,
    },
  })
}

export interface ExecuteImportInput {
  format: ImportFormat
  /** 文件/文本内容 */
  content: string | Buffer | null
  rawOptions: unknown
  authorId: string
}
