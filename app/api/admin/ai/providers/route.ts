/**
 * /api/admin/ai/providers - AI 服务商管理（管理员）
 *
 * GET  列出服务商（apiKey 脱敏）
 * POST 创建服务商
 */
import { withApi, ok, readJson, throw400, throw403 } from '@/lib/api/withApi'
import { prisma } from '@/lib/prisma'
import { encrypt, maskApiKey } from '@/lib/crypto'
import { getProviderMeta } from '@/lib/ai/providers'

type ProviderWithMaskedKey = {
  id: string
  name: string
  slug: string
  baseUrl: string | null
  apiKey: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

/**
 * GET /api/admin/ai/providers
 */
export const GET = withApi.auth(async (_req, _ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }

  const providers = await prisma.aiProvider.findMany({
    orderBy: { createdAt: 'desc' },
  })

  const maskedProviders: ProviderWithMaskedKey[] = providers.map((p) => ({
    ...p,
    apiKey: p.apiKey ? maskApiKey(p.apiKey) : null,
  }))

  return ok({ data: maskedProviders })
})

/**
 * POST /api/admin/ai/providers
 */
export const POST = withApi.auth(async (req, _ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }

  const body = await readJson<{ name?: string; slug?: string; baseUrl?: string; apiKey?: string }>(req)
  const { name, slug, baseUrl, apiKey } = body

  if (!name || !slug) {
    throw400('MISSING_FIELDS', 'Missing required fields')
  }

  // Check slug uniqueness
  const existing = await prisma.aiProvider.findUnique({
    where: { slug },
  })
  if (existing) {
    throw400('DUPLICATE_SLUG', 'Provider slug already exists')
  }

  // 预设填充：若 slug 在字典中且未传 baseUrl，从字典读取
  const meta = getProviderMeta(slug!)
  const finalBaseUrl = baseUrl || (meta ? meta.baseUrl : null)

  let encryptedKey: string | null = null
  if (apiKey) {
    try {
      encryptedKey = encrypt(apiKey)
    } catch (err: any) {
      // 写入路径必须配置密钥，给清晰提示（不要 500 通用错误）
      if (err?.message?.includes('AI_CONFIG_ENCRYPTION_KEY')) {
        throw400(
          'MISSING_ENCRYPTION_KEY',
          'AI_CONFIG_ENCRYPTION_KEY 环境变量未设置，请先在 .env 配置 32 字节密钥再添加服务商',
        )
      }
      throw err
    }
  }

  const provider = await prisma.aiProvider.create({
    data: {
      name: name!,
      slug: slug!,
      baseUrl: finalBaseUrl || null,
      apiKey: encryptedKey,
      isActive: true,
    },
  })

  return ok({ data: provider })
})
