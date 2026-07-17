/**
 * /api/submissions - 提交代码 / 提交记录列表
 *
 * GET  鉴权：分页查询（problemId / userId / status 过滤）
 *      - 普通用户：仅可查询自己的提交（强制 userId = 当前用户）
 *      - 管理员：可查询任意 userId
 * POST 鉴权：提交代码（自动加入评测队列）
 */
import { withApi, ok, readJson, readQuery, throw400, throw403, throw404 } from '@/lib/api/withApi'
import { submitCode, listSubmissionsAdvanced } from '@/lib/submission/service'
import { toInt } from '@/lib/api/validation'
import { logger } from '@/lib/logger'
import { canAccessAdmin } from '@/lib/permissions'

// 支持的提交语言白名单（与 lib/judge/compiler.ts 的 languageConfigs 一致）
const ALLOWED_LANGUAGES = ['cpp', 'c', 'python']

export const GET = withApi.auth(async (req, _ctx, { user }) => {
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

  // 权限校验：普通用户仅能查询自己的提交记录；
  // 仅管理员（SYSTEM_ADMIN / ADMIN）可指定任意 userId 查询他人提交。
  // 防止未登录用户通过 /api/submissions 直接读取全站提交列表。
  const isAdmin = canAccessAdmin(user)
  const effectiveUserId = isAdmin ? q.userId : user.id
  // 普通用户请求他人提交时直接拒绝（防止越权）
  if (!isAdmin && q.userId && q.userId !== user.id) {
    throw403('只能查看自己的提交记录')
  }

  const data = await listSubmissionsAdvanced(page, limit, {
    problemId: q.problemId,
    userId: effectiveUserId,
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
