/**
 * 商品详情管理
 * PATCH /api/classes/[id]/points/shop/[itemId] - 更新商品
 */
import { withApi, ok, readJson, throw400, throw403 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { updateShopItem } from '@/lib/points/shop'
import { getCurrentClassMember, isClassAdminRole } from '@/lib/class/service'

export const PATCH = withApi.auth(async (req, ctx, { user }) => {
  const { id: classId, itemId } = (ctx as any).params
  if (!isObjectId(classId) || !isObjectId(itemId)) {
    throw400('INVALID_ID', '无效的ID')
  }

  const member = await getCurrentClassMember(classId, user.id)
  if (!member || !isClassAdminRole(member.role)) throw403('需要管理员权限')

  const body = await readJson<Record<string, any>>(req)
  const result = await updateShopItem(itemId, body)

  if (!result.success) throw400('UPDATE_FAILED', result.error || '更新失败')
  return ok({ message: result.message })
})
