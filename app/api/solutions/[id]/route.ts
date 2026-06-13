/**
 * /api/solutions/[id] - 题解详情/更新/删除
 *
 * GET    公开：获取题解详情（含权限校验 + 浏览去重 +1）
 * PATCH  鉴权：更新（作者 / 管理员 / 教师）
 * DELETE 鉴权：删除（作者 / 管理员 / 教师，级联删评论）
 */
import { withApi, ok, readJson, readQuery, throw400, throw403, throw404 } from '@/lib/api/withApi'
import { verifyToken } from '@/lib/auth'
import {
  getSolutionDetailWithPermission,
  updateUserSolution,
  deleteUserSolution,
  loadSolutionViewUser,
} from '@/lib/solution/service'
import { getUserRoleFlags } from '@/lib/user/service'
import { isObjectId } from '@/lib/api/validation'

function getClientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  return req.headers.get('x-real-ip') || '0.0.0.0'
}

export const GET = withApi.public(async (req, ctx) => {
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的题解ID')

  const q = readQuery<{ isAssignmentContext?: string }>(req)
  const isAssignmentContext = q.isAssignmentContext === 'true'

  // 提取 viewer（user）
  const viewer = await loadSolutionViewUser(req)
  // viewer 内部已读 DB，但原始 userId 也需要用于 isSolutionLiked
  const token = req.cookies.get('token')?.value
  const viewerUserId = token ? verifyToken(token)?.userId : undefined

  const ip = getClientIp(req)
  const result = await getSolutionDetailWithPermission(
    id,
    isAssignmentContext,
    viewer,
    viewerUserId,
    ip
  )

  if (!result.found) throw404('题解不存在')
  if (!result.allowed) {
    return Response.json(
      { ok: false, success: false, error: '无权查看题解', permission: result.permission, code: 'FORBIDDEN' },
      { status: 403 }
    )
  }
  return ok({ ...result.solution, permission: result.permission })
})

export const PATCH = withApi.auth(async (req, ctx, { user }) => {
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的题解ID')

  const body = await readJson<{
    title?: string
    content?: string
    codeLanguage?: string | null
    code?: string | null
  }>(req)

  // 鉴权：作者本人 或 管理员/教师
  const dbUser = await getUserRoleFlags(user.id)
  const isAdmin = user.role === 'admin' || user.role === 'super_admin' || dbUser?.isAdmin === true
  const isTeacher = dbUser?.role === 'TEACHER'

  try {
    const updated = await updateUserSolution(id, user.id, isAdmin, isTeacher, body)
    return ok({ data: updated, message: '题解更新成功' })
  } catch (err: any) {
    if (err?.status === 400) throw400('VALIDATION', err.message)
    if (err?.status === 403) throw403(err.message)
    if (err?.status === 404) throw404(err.message)
    throw err
  }
})

export const DELETE = withApi.auth(async (_req, ctx, { user }) => {
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的题解ID')

  const dbUser = await getUserRoleFlags(user.id)
  const isAdmin = user.role === 'admin' || user.role === 'super_admin' || dbUser?.isAdmin === true
  const isTeacher = dbUser?.role === 'TEACHER'

  try {
    await deleteUserSolution(id, user.id, isAdmin, isTeacher)
    return ok({ message: '题解已删除' })
  } catch (err: any) {
    if (err?.status === 403) throw403(err.message)
    if (err?.status === 404) throw404(err.message)
    throw err
  }
})
