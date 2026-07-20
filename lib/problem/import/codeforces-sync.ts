/**
 * lib/problem/import/codeforces-sync.ts
 * Codeforces 公开题库同步
 *
 * 通过 Codeforces 官方 API（https://codeforces.com/api/problemset.problems）
 * 拉取全站题目元数据并转换为 ImportedProblem[]。
 *
 * 注意：CF API 只提供题目元数据（题号、标题、tags、rating），不提供题面内容。
 * 导入后题面字段会写入"参见 CF 原题链接"的占位，管理员可后续手动补充。
 *
 * 安全：使用 safeFetch（SSRF 防护），统一网络出口策略。
 */
import { ApiError } from '@/lib/api/withApi'
import { safeFetch } from '@/lib/security/safe-fetch'
import { logger } from '@/lib/logger'
import type { ImportedProblem } from './types'

const CF_API_URL = 'https://codeforces.com/api/problemset.problems'

/** CF rating → 大山 OJ 8 档难度映射 */
function ratingToDifficulty(rating?: number): string {
  if (!rating || !Number.isFinite(rating)) return '入门'
  // CF rating 范围通常 800-3500，按等差映射到 8 档
  if (rating < 1000) return '入门'
  if (rating < 1200) return '普及-'
  if (rating < 1400) return '普及'
  if (rating < 1600) return '普及+'
  if (rating < 1900) return '提高'
  if (rating < 2200) return '提高+'
  if (rating < 2600) return '省选'
  return 'NOI'
}

interface CfProblem {
  contestId: number
  index: string
  name: string
  type: string
  rating?: number
  points?: number
  tags: string[]
}

interface CfResponse {
  status: string
  result?: {
    problems: CfProblem[]
    problemStatistics: any[]
  }
  comment?: string
}

/**
 * 从 Codeforces API 同步题目
 *
 * @param options 过滤选项
 *   - tags: 仅保留包含任一指定 tag 的题目（CF tag 名，如 "dp", "greedy"）
 *   - ratingRange: [min, max] rating 过滤
 *   - limit: 最大同步题数（默认 100）
 *   - contestId: 仅同步指定比赛题目（可选）
 */
export async function fetchCodeforcesProblems(options: {
  tags?: string[]
  ratingRange?: [number, number]
  limit?: number
  contestId?: number
} = {}): Promise<ImportedProblem[]> {
  const { tags, ratingRange, limit = 100, contestId } = options

  logger.info(`[cf-sync] 开始拉取 Codeforces 题库，limit=${limit}`)

  const resp = await safeFetch(CF_API_URL, {
    method: 'GET',
    timeoutMs: 30000,
  })
  if (!resp.ok) {
    throw new ApiError(
      'CF_API_ERROR',
      `Codeforces API 请求失败: HTTP ${resp.status}`,
      502
    )
  }

  const data = await resp.json<CfResponse>()
  if (data.status !== 'OK' || !data.result?.problems) {
    throw new ApiError(
      'CF_API_ERROR',
      `Codeforces API 返回异常: ${data.comment || data.status}`,
      502
    )
  }

  let problems = data.result.problems

  // contestId 过滤
  if (contestId) {
    problems = problems.filter(p => p.contestId === contestId)
  }

  // rating 过滤
  if (ratingRange) {
    const [min, max] = ratingRange
    problems = problems.filter(p => {
      const r = p.rating
      return typeof r === 'number' && r >= min && r <= max
    })
  }

  // tags 过滤（任一匹配即保留，CF tags 小写）
  if (tags && tags.length > 0) {
    const wanted = new Set(tags.map(t => t.toLowerCase()))
    problems = problems.filter(p => p.tags.some(t => wanted.has(t.toLowerCase())))
  }

  // 上限保护
  problems = problems.slice(0, Math.min(limit, 500))

  logger.info(`[cf-sync] 过滤后剩余 ${problems.length} 题，准备转换`)

  return problems.map((p, idx) => {
    const cfId = `${p.contestId}${p.index}`
    const cfUrl = `https://codeforces.com/problemset/problem/${p.contestId}/${p.index}`

    return {
      // 不分配 problemNumber，由 service 层自动生成
      title: `[CF ${cfId}] ${p.name}`,
      description:
        `## Codeforces ${cfId}: ${p.name}\n\n` +
        `**Rating**: ${p.rating ?? 'N/A'}\n\n` +
        `**Tags**: ${p.tags.join(', ') || 'N/A'}\n\n` +
        `**题目链接**: [${cfUrl}](${cfUrl})\n\n` +
        `---\n\n` +
        `> 本题通过 Codeforces API 同步导入，CF API 不提供题面正文。\n` +
        `> 请点击上方链接查看原题，或管理员手动补充题面描述。`,
      input: '参见 Codeforces 原题',
      output: '参见 Codeforces 原题',
      samples: [],
      hint: `CF Rating: ${p.rating ?? 'N/A'}；Tags: ${p.tags.join(', ')}`,
      source: `Codeforces ${cfId}`,
      difficulty: ratingToDifficulty(p.rating),
      tags: ['Codeforces', ...p.tags],
      timeLimit: 1000,
      memoryLimit: 256,
      testCases: [],
      externalId: `cf-${cfId}-${idx}`,
    }
  })
}
