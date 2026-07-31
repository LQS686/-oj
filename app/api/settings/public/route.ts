/**
 * GET /api/settings/public - 公开设置
 *
 * 异常时 fail-closed：关闭「常规开放注册」，避免配置读取失败时误开注册。
 * needsBootstrap：空库（或无法确认用户数）时前端仍展示「创建管理员」入口，
 * 与 POST /api/auth/register 的首用户例外对齐；切勿在计数失败时写成 false。
 */
import { withApi, ok } from '@/lib/api/withApi'
import { getSystemSettings } from '@/lib/settings'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export const GET = withApi.public(async () => {
  try {
    const settings = await getSystemSettings()
    // 默认按「待引导」处理：只有明确 count>0 才关闭引导
    let needsBootstrap = true
    try {
      needsBootstrap = (await prisma.user.count()) === 0
    } catch (countError) {
      logger.warn(
        '[settings/public] 用户计数失败，needsBootstrap=true（避免空库被误判为已初始化）',
        countError,
      )
      needsBootstrap = true
    }
    return ok({
      siteName: settings.siteName,
      siteDescription: settings.siteDescription,
      allowRegistration: settings.allowRegistration,
      needsBootstrap,
      defaultLanguage: settings.defaultLanguage,
    })
  } catch (error) {
    logger.error('[settings/public] 读取失败，fail-closed（保留 needsBootstrap 引导）', error)
    return ok({
      siteName: '大山 OJ',
      siteDescription: '代码如山·算法为径·陪你从入门到顶峰',
      allowRegistration: false,
      // 读库失败时不能断言「已有用户」，否则首次部署永远看不到注册入口
      needsBootstrap: true,
      defaultLanguage: 'cpp',
    })
  }
})
