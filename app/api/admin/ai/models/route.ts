/**
 * /api/admin/ai/models - AI 模型管理（管理员）
 *
 * GET  列出可用模型（已过滤掉孤儿/挂载在已禁用 Provider 上的模型）
 * POST 创建模型
 */
import { withApi, ok, readJson, throw400, throw403 } from '@/lib/api/withApi'
import { createAiModel, listActiveAiModelsEnriched } from '@/lib/ai/service'

/**
 * GET /api/admin/ai/models
 *
 * 使用两步查询避免 MongoDB 在 include 孤儿引用时抛 500：
 *   1) 仅拉取 isActive=true 的 models
 *   2) 拉取这些 models 引用的 providers（同时要求 provider isActive=true）
 *   3) 过滤掉 provider 不存在或 provider.isActive=false 的 models
 *   4) 手动 enrich 后返回
 * 严格过滤的目的：即使数据库中残留历史脏数据（如 provider 已被软删除），
 * 也不会让"挂在已禁用 Provider 上的模型"出现在前端 UI 上。
 */
export const GET = withApi.auth(async (_req, _ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }

  const { data, orphanCount } = await listActiveAiModelsEnriched()
  return ok({ data, _orphanFiltered: orphanCount })
})

/**
 * POST /api/admin/ai/models
 */
export const POST = withApi.auth(async (req, _ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }

  const body = await readJson<{
    name?: string
    model?: string
    providerId?: string
    type?: string
    maxTokens?: number
    temperature?: number
    timeout?: number
    params?: Record<string, unknown>
  }>(req)
  const {
    name, model, providerId, type,
    maxTokens, temperature, timeout, params,
  } = body

  if (!name || !model || !providerId || !type) {
    throw400('MISSING_FIELDS', 'Missing required fields')
  }

  const newModel = await createAiModel({
    name: name!,
    model: model!,
    providerId: providerId!,
    type: type!,
    maxTokens, temperature, timeout, params,
  })

  return ok({ data: newModel })
})
