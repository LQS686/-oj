/**
 * /api/admin/settings - 系统设置（管理员）
 *
 * GET  读取系统设置
 * PUT  保存系统设置
 */
import { withApi, ok, readJson, throw400, throw403, throw500 } from '@/lib/api/withApi'
import { withPermission } from '@/lib/api/withPermission'
import { isSystemAdmin } from '@/lib/permissions'
import { getSystemSettings, saveSystemSettings } from '@/lib/settings'

/**
 * GET /api/admin/settings
 */
export const GET = withApi.auth(async (_req, _ctx, { user }) => {
  if (!isSystemAdmin(user)) {
    throw403('需要系统管理员权限')
  }

  const settings = await getSystemSettings()
  return ok(settings)
})

/**
 * PUT /api/admin/settings
 */
export const PUT = withApi.auth(withPermission('admin.access')(async (req, _ctx, { user }) => {
  if (!isSystemAdmin(user)) {
    throw403('需要系统管理员权限')
  }

  const body = await readJson<Record<string, any>>(req)
  const saved = await saveSystemSettings(body)

  if (!saved) {
    throw500('保存设置失败')
  }

  const newSettings = await getSystemSettings()

  return ok({ message: '设置已保存', data: newSettings })
}))
