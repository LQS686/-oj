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

/**
 * 构造登录页 URL，登录后回到 from。
 * 渲染 Link 时必须传入稳定路径（如 usePathname()），禁止依赖 window，否则会水合不一致。
 */
export function loginPath(from: string = '/'): string {
  const safe = safeInternalPath(from, '/')
  if (safe === '/login' || safe.startsWith('/login?') || safe === '/register') {
    return '/login'
  }
  return `/login?redirect=${encodeURIComponent(safe)}`
}

/** 仅用于客户端事件（onClick / useEffect），读取当前地址栏 */
export function loginPathFromLocation(): string {
  if (typeof window === 'undefined') {
    throw new Error('loginPathFromLocation() is client-only')
  }
  return loginPath(`${window.location.pathname}${window.location.search}`)
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
