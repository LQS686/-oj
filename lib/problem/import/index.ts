/**
 * lib/problem/import/index.ts
 * 批量导入题库 - 统一入口
 *
 * 支持格式：FPS / Hydro / SYZOJ / CSV / Codeforces API / DSOJ 标准
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
} from './types'

export {
  importProblems,
  importOneProblem,
} from './service'

export {
  executeProblemImport,
  parseImportOptions,
  parseImportByFormat,
  VALID_IMPORT_FORMATS,
  IMPORT_MAX_FILE_BYTES,
} from './execute'

export {
  parseFps,
  parseFpsXml,
  parseFpsJson,
} from './fps-parser'

export {
  parseHydroZip,
  parseHydroJson,
} from './hydro-parser'

export { parseSyzojJson } from './syzoj-parser'

export { parseCsvProblems } from './csv-parser'

export { fetchCodeforcesProblems } from './codeforces-sync'

// DSOJ 标准格式（自主可控，推荐用于爬虫批量采集和题库迁移）
export {
  parseDsojZip,
  parseDsojArchive,
  isDsojPack,
  isDsojPackArchive,
  DSOJ_PACK_VERSION,
  DSOJ_PACK_FORMAT_ID,
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
