/**
 * GET /api/ai/providers-presets
 *
 * 公共端点（无需鉴权），返回 AI 服务商预设清单。
 * 用于前端「添加服务商」下拉预设选择。
 *
 * 迁移到 withApi 中间件模式
 */
import { withApi, ok } from '@/lib/api/withApi'
import { listProviders } from '@/lib/ai/providers'

export const GET = withApi.public(async () => {
  return ok(listProviders())
})
