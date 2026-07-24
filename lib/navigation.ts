/**
 * lib/navigation.ts
 * 站内导航辅助：登录回跳、安全内部路径校验
 */

/** 仅允许站内相对路径，防止开放重定向 */
export function safeInternalPath(raw: string | null | undefined, fallback = '/'): string {
  if (!raw) return fallback
  let decoded = raw
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    return fallback
  }
  if (!decoded.startsWith('/') || decoded.startsWith('//')) return fallback
  if (decoded.includes('\\') || decoded.includes('\0')) return fallback
  return decoded
}

/** 构造登录页 URL，登录后回到 from（默认当前路径） */
export function loginPath(from?: string): string {
  const target =
    from ??
    (typeof window !== 'undefined'
      ? `${window.location.pathname}${window.location.search}`
      : '/')
  const safe = safeInternalPath(target, '/')
  if (safe === '/login' || safe.startsWith('/login?') || safe === '/register') {
    return '/login'
  }
  return `/login?redirect=${encodeURIComponent(safe)}`
}

/** 从登录页 query 解析回跳地址（兼容 redirect / returnUrl） */
export function resolveLoginRedirect(search?: string | URLSearchParams): string {
  const params =
    typeof search === 'string'
      ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
      : search ??
        (typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search)
          : new URLSearchParams())
  return safeInternalPath(params.get('redirect') ?? params.get('returnUrl'), '/')
}
