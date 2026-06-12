/**
 * 加入班级（通过邀请码）
 * POST /api/classes/join
 */
import { withApi, ok, readJson, throw400 } from '@/lib/api/withApi'
import { joinClassByCode } from '@/lib/class/service'

export const POST = withApi.auth(async (req, _ctx, { user }) => {
  const body = await readJson<{ code?: string }>(req)
  if (!body.code) throw400('MISSING_CODE', '请提供邀请码')

  const result = await joinClassByCode(body.code!, user.id)
  if (!result.ok) {
    if (result.code === 404) throw400('NOT_FOUND', result.reason || '邀请码不存在')
    throw400('JOIN_FAILED', result.reason || '加入班级失败')
  }

  return ok({
    classId: result.classId!,
    className: result.className!,
    message: `成功加入班级 ${result.className!}`,
  })
})
