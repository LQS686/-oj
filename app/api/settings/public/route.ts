/**
 * GET /api/settings/public - 公开设置
 *
 * 迁移到 withApi 中间件模式
 */
import { withApi, ok } from '@/lib/api/withApi'
import { getSystemSettings } from '@/lib/settings'

export const GET = withApi.public(async () => {
  try {
    const settings = await getSystemSettings()
    return ok({
      siteName: settings.siteName,
      siteDescription: settings.siteDescription,
      allowRegistration: settings.allowRegistration,
      defaultLanguage: settings.defaultLanguage,
    })
  } catch (error) {
    return ok({
      siteName: 'OJ Platform',
      siteDescription: '在线评测系统',
      allowRegistration: true,
      defaultLanguage: 'cpp',
    })
  }
})
