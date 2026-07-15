/**
 * /api/admin/settings - 系统设置（管理员）
 *
 * GET  读取系统设置
 * PUT  保存系统设置
 */
import { withApi, ok, readJson, throw400, throw500 } from '@/lib/api/withApi'
import { getSystemSettings, saveSystemSettings } from '@/lib/settings'

/**
 * GET /api/admin/settings
 */
export const GET = withApi.systemAdmin(async () => {
  const settings = await getSystemSettings()
  return ok(settings)
})

/**
 * PUT /api/admin/settings
 */
export const PUT = withApi.systemAdmin(async (req, _ctx) => {
  const body = await readJson<Record<string, any>>(req)
  const saved = await saveSystemSettings(body)

  if (!saved) {
    throw500('保存设置失败')
  }

  const newSettings = await getSystemSettings()

  // 修复：ok() 已包装一层 data 字段，这里不能再嵌套 data。
  // 之前 ok({ message, data: newSettings }) 会导致前端 response.data.data 才是 settings。
  return ok({ ...newSettings, message: '设置已保存' })
})
