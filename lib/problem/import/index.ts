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
  isDsojPack,
  DSOJ_PACK_VERSION,
  DSOJ_PACK_FORMAT_ID,
} from './dsoj-parser'
