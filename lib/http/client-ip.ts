/**
 * lib/http/client-ip.ts
 * 从请求头解析客户端 IP（按受信任代理层数取 XFF，禁止信任首段伪造值）
 */
export function getTrustedProxyCount(): number {
  const raw = process.env.TRUSTED_PROXIES
  if (raw === undefined || raw === '') return 1
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n >= 0 ? n : 1
}

/**
 * @param forwarded X-Forwarded-For 原始值
 * @param fallback  无可信 XFF 时的回退（如 socket.address / x-real-ip）
 */
export function resolveClientIp(
  forwarded: string | undefined | null,
  fallback: string | undefined | null = null,
  trustedProxies: number = getTrustedProxyCount()
): string {
  // 未信任任何代理时，忽略 XFF（可被客户端伪造）
  if (trustedProxies <= 0) {
    return (fallback && fallback.trim()) || 'unknown'
  }

  if (forwarded) {
    const ips = forwarded.split(',').map((ip) => ip.trim()).filter(Boolean)
    if (ips.length > 0) {
      // 右侧 N 个由受信任代理追加；客户端 IP 在倒数第 N 个
      // 例：TRUSTED=1 且 "forged, real" → 取 real（下标 length-1）
      const idx = ips.length - trustedProxies
      if (idx >= 0 && idx < ips.length) {
        return ips[idx]
      }
      // 代理层数声明多于实际条目时，取最左（仍优于信任攻击者随意填写的中间值）
      return ips[0]
    }
  }

  return (fallback && fallback.trim()) || 'unknown'
}
