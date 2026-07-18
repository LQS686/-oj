/**
 * /api/admin/ai/suggest-metadata - 元数据建议（管理员）
 *
 * POST 接受 { input: { description, samples?, input?, output? } }，调 enqueueMetadataSuggestion
 * 返回 { success: true, data: { logId } }
 *
 * 鉴权：管理员 / 教师（withApi.admin）
 */
import { withApi, ok, throw400, readJson } from '@/lib/api/withApi'
import { enqueueMetadataSuggestion } from '@/lib/ai/service'

interface SuggestMetadataInput {
  description?: string
  samples?: unknown
  input?: string
  output?: string
}

export const POST = withApi.admin(async (req, _ctx, { user }) => {
  const body = await readJson<{ input?: SuggestMetadataInput }>(req)
  const rawInput = body?.input

  // 三元 + throw400(never) 收窄类型（控制流分析对 never 返回的 const 箭头不可靠）
  const input = rawInput ? rawInput : throw400('MISSING_FIELDS', 'input 必填')
  const description =
    typeof input.description === 'string' && input.description.trim()
      ? input.description
      : throw400('MISSING_FIELDS', 'input.description 必填')

  const result = await enqueueMetadataSuggestion(
    {
      description,
      samples: Array.isArray(input.samples) ? input.samples : undefined,
      input: typeof input.input === 'string' ? input.input : undefined,
      output: typeof input.output === 'string' ? input.output : undefined,
    },
    user.id
  )
  return ok({ logId: result.logId })
})
