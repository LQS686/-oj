/**
 * /api/setup/state - 部署引导状态（公开）
 *
 * 返回 { needsBootstrap: boolean }，供 /setup 引导页自检与恢复后跳转判断。
 */
import { ok } from '@/lib/api/response'
import { isDatabaseEmpty } from '@/lib/backup/restore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = async () => {
  const needsBootstrap = await isDatabaseEmpty()
  return ok({ needsBootstrap })
}
