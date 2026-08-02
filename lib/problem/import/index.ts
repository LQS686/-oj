/**
 * lib/problem/import/index.ts
 * 批量导入题库 - 统一入口（仅支持 DSOJ 标准题包）
 */
export type {
  ImportedProblem,
  ImportedTestCase,
  ImportedSample,
  ImportedSolution,
  ImportedProblemResult,
  ImportBatchResult,
  ImportFormat,
  ImportOptions,
  ImportStreamEvent,
  ImportStreamDoneSummary,
} from './types'

export {
  importProblems,
  importOneProblem,
} from './service'

export {
  executeProblemImport,
  executeProblemImportStream,
  prepareProblemImport,
  parseImportOptions,
  parseImportByFormat,
  VALID_IMPORT_FORMATS,
  IMPORT_MAX_FILE_BYTES,
} from './execute'

// DSOJ 标准格式（自主实现，推荐用于爬虫批量采集和题库迁移）
export {
  parseDsojZip,
  parseDsojArchive,
  parseDsojArchiveDetailed,
  isDsojPack,
  isDsojPackArchive,
  DSOJ_PACK_VERSION,
  DSOJ_PACK_FORMAT_ID,
  type DsojParseJobResult,
  type ArchiveEntry,
  type ArchiveLike,
} from './dsoj-parser'

// DSOJ tar.xz 题包解压适配器（系统 xz 命令 + tar-stream）
//   - detectArchiveFormat：按魔数分派 zip / tar.xz
//   - parseTarXzBuffer：解压 tar.xz 为 InMemoryArchive，复用 parseDsojArchive 解析
export {
  parseTarXzBuffer,
  detectArchiveFormat,
  type DsojArchiveKind,
} from './tarxz-archive'
