/**
 * GET /api/settings/public - 公开设置
 *
 * 异常时 fail-closed：关闭注册，避免配置读取失败时误开注册。
 */
import { withApi, ok } from '@/lib/api/withApi'
import { getSystemSettings } from '@/lib/settings'
import { logger } from '@/lib/logger'

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
    logger.error('[settings/public] 读取失败，fail-closed', error)
    return ok({
      siteName: '大山 OJ',
      siteDescription: '代码如山·算法为径·陪你从入门到顶峰',
      allowRegistration: false,
      defaultLanguage: 'cpp',
    })
  }
})
