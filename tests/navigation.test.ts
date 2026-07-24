import { describe, it, expect } from 'vitest'
import { safeInternalPath, loginPath, resolveLoginRedirect } from '@/lib/navigation'

describe('navigation helpers', () => {
  it('rejects open redirects', () => {
    expect(safeInternalPath('//evil.com')).toBe('/')
    expect(safeInternalPath('https://evil.com')).toBe('/')
    expect(safeInternalPath('/problems')).toBe('/problems')
    expect(safeInternalPath('/contests/1?x=1')).toBe('/contests/1?x=1')
  })

  it('builds login path with redirect', () => {
    expect(loginPath('/settings')).toBe('/login?redirect=%2Fsettings')
    expect(loginPath('/login')).toBe('/login')
  })

  it('resolves redirect and returnUrl', () => {
    expect(resolveLoginRedirect('redirect=%2Fclasses')).toBe('/classes')
    expect(resolveLoginRedirect('returnUrl=%2Frank')).toBe('/rank')
    expect(resolveLoginRedirect('redirect=%2F%2Fevil.com')).toBe('/')
  })
})
