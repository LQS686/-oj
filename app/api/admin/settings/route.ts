/**
 * /api/admin/settings - 系统设置（管理员）
 *
 * GET  读取系统设置
 * PUT  保存系统设置
 */
import { withApi, ok, readJson, throw400, throw403, throw500 } from '@/lib/api/withApi'
import { getSystemSettings, saveSystemSettings } from '@/lib/settings'

/**
 * GET /api/admin/settings
 */
export const GET = withApi.auth(async (_req, _ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }

  const settings = await getSystemSettings()
  return ok({ data: settings })
})

/**
 * PUT /api/admin/settings
 */
export const PUT = withApi.auth(async (req, _ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }

  const body = await readJson<Record<string, any>>(req)
  const saved = await saveSystemSettings(body)

  if (!saved) {
    throw500('保存设置失败')
  }

  const newSettings = await getSystemSettings()

  return ok({ message: '设置已保存', data: newSettings })
})
