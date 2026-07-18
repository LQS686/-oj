/**
 * GET /api/ai/capabilities - 用户端 AI 能力清单（预留接口）
 *
 * 当前为预留占位：始终返回空数组，不返回任何敏感信息。
 * 登录态可选：未登录用户也可访问，仍返回空数组。
 * 未来用户端 AI 能力上线后，再在此处填充实际能力清单。
 */
import { withApi, ok } from '@/lib/api/withApi'

export const GET = withApi.public(async () => {
  return ok([])
})
