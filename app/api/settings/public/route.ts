/**
 * GET /api/settings/public - 公开设置
 *
 * 实现与 Root Layout 的 SSR 注入共用 lib/settings.ts 的 getPublicSettings()：
 * 首次加载由 SSR 直接注入，本接口保留给「切回标签页 / 主动刷新」等场景。
 *
 * 异常时 fail-closed：关闭「常规开放注册」，避免配置读取失败时误开注册。
 */
import { withApi, ok } from '@/lib/api/withApi'
import { getPublicSettings } from '@/lib/settings'

export const GET = withApi.public(async () => {
  return ok(await getPublicSettings())
})
