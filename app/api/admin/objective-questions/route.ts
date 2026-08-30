/**
 * /api/admin/objective-questions - 管理员客观题管理
 *
 * GET  客观题列表（支持 ?keyword= 关键字搜索 + ?type=&difficulty=&tag= 筛选 + ?page=&pageSize= 分页）
 * POST 创建客观题（题号服务端自动生成）
 */
import { withApi, ok, readJson, ApiError } from '@/lib/api/withApi'
import { validateObjectiveQuestionPayload } from '@/lib/objective-question/validation'
import { listObjectiveQuestions, createObjectiveQuestion } from '@/lib/objective-question/service'

/**
 * GET /api/admin/objective-questions - 获取客观题列表（管理员）
 *
 * Query 参数：
 * - keyword: 关键字（questionNumber 精确匹配 / 标题模糊匹配）
 * - type: 题型过滤（single-choice / multiple-choice / true-false / fill-blank）
 * - difficulty: 难度过滤（简单 / 中等 / 困难）
 * - tag: 标签过滤（单标签命中）
 * - page / pageSize: 分页参数（默认 page=1&pageSize=20，pageSize 上限 100）
 */
export const GET = withApi.admin(async (req) => {
  const url = new URL(req.url)
  const keyword = url.searchParams.get('keyword') || undefined
  const type = url.searchParams.get('type') || undefined
  const difficulty = url.searchParams.get('difficulty') || undefined
  const tag = url.searchParams.get('tag') || undefined
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

  return ok(await listObjectiveQuestions({ keyword, type, difficulty, tag, page, pageSize }))
})

/**
 * POST /api/admin/objective-questions - 创建客观题（管理员）
 * 题号（questionNumber）由服务端自动生成，body 中无需（有也忽略）
 */
export const POST = withApi.admin(async (req, _ctx, { user }) => {
  const body = await readJson<unknown>(req)
  const result = validateObjectiveQuestionPayload(body)
  if (!result.ok) {
    // 直接 throw（而非 throw400()）以便 TS 正确收窄 result.data
    throw new ApiError('VALIDATION', result.error, 400)
  }
  const question = await createObjectiveQuestion(result.data, user.id)
  return ok({ question, message: '题目创建成功' }, { status: 201 })
})
