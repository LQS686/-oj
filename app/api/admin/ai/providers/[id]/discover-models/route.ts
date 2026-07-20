/**
 * /api/admin/ai/providers/[id]/discover-models - 发现 AI 服务商模型
 *
 * GET  拉取该服务商的模型列表（只读，前端打开「发现」抽屉时调用）
 * POST 主动触发模型发现（保留写入语义，便于未来加入缓存/审计）
 *
 * 两者均调用 discoverProviderModels（仅请求外部 /models 接口，不写数据库）。
 */
import type { NextRequest } from 'next/server'
import { withApi, ok, throw400, type ApiContext } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { discoverProviderModels } from '@/lib/ai/discover'

async function handleDiscover(_req: NextRequest, ctx: ApiContext) {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的ID')
  const models = await discoverProviderModels(id)
  return ok(models)
}

export const GET = withApi.admin(handleDiscover)
export const POST = withApi.admin(handleDiscover)
