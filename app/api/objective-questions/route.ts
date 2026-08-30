/**
 * /api/objective-questions - 客观题只读列表（教师选题用）
 *
 * GET  客观题列表（登录即可：教师 / 助教 / 学生均可读）
 *      响应绝不包含 answer 与 explanation
 */
import { withApi, ok } from '@/lib/api/withApi'
import { listObjectiveQuestionsPublic } from '@/lib/objective-question/service'

/**
 * GET /api/objective-questions - 只读客观题列表
 *
 * Query 参数：
 * - keyword: 关键字（questionNumber 精确匹配 / 标题模糊匹配）
 * - type: 题型过滤（single-choice / multiple-choice / true-false / fill-blank）
 * - difficulty: 难度过滤（简单 / 中等 / 困难）
 * - page / pageSize: 分页参数（默认 page=1&pageSize=20，pageSize 上限 100）
 */
export const GET = withApi.auth(async (req) => {
  const url = new URL(req.url)
  const keyword = url.searchParams.get('keyword') || undefined
  const type = url.searchParams.get('type') || undefined
  const difficulty = url.searchParams.get('difficulty') || undefined
  const pageStr = url.searchParams.get('page')
  const pageSizeStr = url.searchParams.get('pageSize')
  // 非法分页参数（NaN / 非正数）回落 undefined，由 service 层使用默认值
  const parsedPage = pageStr ? parseInt(pageStr, 10) : undefined
  const parsedPageSize = pageSizeStr ? parseInt(pageSizeStr, 10) : undefined
  const page = Number.isFinite(parsedPage) && (parsedPage as number) > 0
    ? parsedPage as number
    : undefined
  const pageSize = Number.isFinite(parsedPageSize) && (parsedPageSize as number) > 0
    ? parsedPageSize as number
    : undefined

  return ok(await listObjectiveQuestionsPublic({ keyword, type, difficulty, page, pageSize }))
})
