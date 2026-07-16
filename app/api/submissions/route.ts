/**
 * /api/submissions - 提交代码 / 提交记录列表
 *
 * GET  公开：分页查询（problemId / userId / status 过滤）
 * POST 鉴权：提交代码（自动加入评测队列）
 */
import { withApi, ok, readJson, readQuery, throw400, throw404 } from '@/lib/api/withApi'
import { submitCode, listSubmissionsAdvanced } from '@/lib/submission/service'
import { toInt } from '@/lib/api/validation'
import { logger } from '@/lib/logger'

// 支持的提交语言白名单（与 lib/judge/compiler.ts 的 languageConfigs 一致）
const ALLOWED_LANGUAGES = ['cpp', 'c', 'python']

export const GET = withApi.public(async (req) => {
  const q = readQuery<{
    page?: string
    limit?: string
    problemId?: string
    userId?: string
    status?: string
  }>(req)

  let page = toInt(q.page, 'page', 1)
  let limit = toInt(q.limit, 'limit', 20)
  if (page < 1) page = 1
  if (limit < 1) limit = 20
  if (limit > 50) limit = 50

  const data = await listSubmissionsAdvanced(page, limit, {
    problemId: q.problemId,
    userId: q.userId,
    status: q.status,
  })
  return ok(data)
})

export const POST = withApi.auth(async (req, _ctx, { user }) => {
  const body = await readJson<{
    problemId: string
    code: string
    language: string
    contestId?: string
  }>(req)

  if (!body.problemId || !body.code || !body.language) {
    throw400('VALIDATION', '缺少必需字段: problemId, code, language')
  }

  // 前置校验：code 长度上限与语言白名单，避免无效提交进入评测队列
  if (typeof body.code !== 'string' || body.code.length > 50000) {
    throw400('VALIDATION', '代码长度不合法（最大 50000 字符）')
  }
  if (typeof body.language !== 'string' || !ALLOWED_LANGUAGES.includes(body.language)) {
    throw400('VALIDATION', '不支持的语言')
  }

  try {
    const submission = await submitCode(user.id, body)
    return ok(
      { data: submission, submissionId: submission.id, message: '代码已提交，正在评测中...' },
      { status: 201 }
    )
  } catch (err: any) {
    logger.error('提交代码失败', err)
    if (err?.status === 404) throw404('资源不存在')
    throw err
  }
})
