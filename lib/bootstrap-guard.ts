/**
 * lib/bootstrap-guard.ts
 * 空库（部署引导）判定的带 TTL 缓存查询，供 middleware 使用。
 *
 * 为什么不直接每请求查库：middleware 会随 matcher 覆盖所有页面请求，
 * 短 TTL（10s）缓存可把 Mongo 查询降到每 10s 一次，且首个用户注册后
 * findFirst 结果为 false，引导自动失效。
 */
import 'server-only'

let cached: { at: number; value: boolean } | null = null
const TTL = 10_000

export async function needsBootstrapNow(): Promise<boolean> {
  if (cached && Date.now() - cached.at < TTL) return cached.value
  const { prisma } = await import('@/lib/prisma')
  let value = true // fail-closed：无法判定时按待引导处理
  try {
    value = (await prisma.user.findFirst({ select: { id: true } })) === null
  } catch {
    /* 保留 fail-closed true */
  }
  cached = { at: Date.now(), value }
  return value
}

/** 清除缓存：首个用户注册成功或恢复后调用，确保引导立即失效。 */
export function invalidateBootstrapCache(): void {
  cached = null
}
