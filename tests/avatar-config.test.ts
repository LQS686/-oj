/**
 * 内置头像配置与白名单校验（纯逻辑，不依赖 DB / Redis）
 *  - sanitizeAvatarUrl：仅放行本站已上传头像与内置头像
 *  - BUILTIN_AVATARS 清单与实际静态资源（public/avatars/*.svg）保持一致
 */
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  AVATAR_UPLOAD_ENABLED,
  BUILTIN_AVATAR_PREFIX,
  BUILTIN_AVATARS,
  isBuiltinAvatar,
} from '@/lib/user/avatar-config'
import { sanitizeAvatarUrl } from '@/lib/user/avatar-url'

describe('avatar-config 内置头像清单', () => {
  it('AVATAR_UPLOAD_ENABLED 为布尔值', () => {
    expect(typeof AVATAR_UPLOAD_ENABLED).toBe('boolean')
  })

  it('清单非空、以 /avatars/ 开头且无重复', () => {
    expect(BUILTIN_AVATARS.length).toBeGreaterThan(0)
    for (const url of BUILTIN_AVATARS) {
      expect(url.startsWith(BUILTIN_AVATAR_PREFIX)).toBe(true)
    }
    expect(new Set(BUILTIN_AVATARS).size).toBe(BUILTIN_AVATARS.length)
  })

  it('清单每一项都能对应到 public 下的真实静态文件', () => {
    for (const url of BUILTIN_AVATARS) {
      const abs = join(process.cwd(), 'public', url.replace(/^\//, ''))
      expect(existsSync(abs), `缺少内置头像文件: ${url}`).toBe(true)
    }
  })

  it('isBuiltinAvatar 精确匹配，拒绝越界写法', () => {
    expect(isBuiltinAvatar(BUILTIN_AVATARS[0])).toBe(true)
    expect(isBuiltinAvatar('/avatars/../secret.svg')).toBe(false)
    expect(isBuiltinAvatar('/avatars/not-exist.svg')).toBe(false)
    expect(isBuiltinAvatar(null)).toBe(false)
    expect(isBuiltinAvatar(undefined)).toBe(false)
  })
})

describe('sanitizeAvatarUrl 白名单', () => {
  it('放行已上传头像与内置头像', () => {
    expect(sanitizeAvatarUrl('/uploads/avatars/abc_123.webp')).toBe('/uploads/avatars/abc_123.webp')
    expect(sanitizeAvatarUrl(BUILTIN_AVATARS[0])).toBe(BUILTIN_AVATARS[0])
  })

  it('置空空值与非法值（外链 / 已废弃的 placeholder / 越界路径）', () => {
    expect(sanitizeAvatarUrl(null)).toBeNull()
    expect(sanitizeAvatarUrl('')).toBeNull()
    expect(sanitizeAvatarUrl(undefined)).toBeNull()
    expect(sanitizeAvatarUrl('https://evil.example.com/x.png')).toBeNull()
    expect(sanitizeAvatarUrl('/api/placeholder/1')).toBeNull()
    expect(sanitizeAvatarUrl('javascript:alert(1)')).toBeNull()
    expect(sanitizeAvatarUrl('/avatars/../uploads/avatars/x.webp')).toBeNull()
  })
})
