/**
 * hooks/usePermission.ts
 * 客户端权限判断 hook
 *
 * 设计目标：
 * - 轻量（避免每次调用都查 DB）
 * - fail-safe：未登录或权限不确定时默认拒绝
 * - 简化实现：只做"基于当前 user.role 的本地判断"
 *   - SYSTEM_ADMIN 永真
 *   - TEACHER 默认有大部分业务权限
 *   - STUDENT 只有 post.* 和 contest.participate.manage
 *
 * 注意：这是 UI 显隐控制，不是真正的安全门。
 * 真正可信的权限校验必须在服务端 hasPermission() 中完成。
 */
'use client'

import { useEffect, useState } from 'react'
import type { PermissionCode } from '@/lib/permissions/types'

interface CurrentUser {
  id: string
  role?: string | null
}

const STUDENT_ALLOWED: PermissionCode[] = [
  'post.create',
  'post.edit',
  'contest.participate.manage',
]

const TEACHER_PREFIXES: string[] = [
  'class.',
  'problem.',
  'contest.',
  'training.',
  'post.',
  'user.view',
  'user.edit',
]

const TEACHER_EXACT: PermissionCode[] = ['user.view', 'user.edit']

function checkLocal(user: CurrentUser | null, code: PermissionCode): boolean {
  if (!user) return false
  if (user.role === 'SYSTEM_ADMIN') return true

  if (user.role === 'TEACHER') {
    if (TEACHER_EXACT.includes(code)) return true
    return TEACHER_PREFIXES.some((p) => code === p || code.startsWith(p))
  }

  if (user.role === 'STUDENT') {
    return STUDENT_ALLOWED.includes(code)
  }

  return false
}

/**
 * 检查当前用户是否拥有指定权限点
 * - 接受单个 code 或 code 数组（数组时任一命中即返回 true，即 OR 语义）
 * - 首次调用时 fetch /api/auth/me（仅一次，组件内多次调用复用状态）
 */
export function usePermission(code: PermissionCode | PermissionCode[]): boolean {
  const [user, setUser] = useState<CurrentUser | null>(null)

  useEffect(() => {
    let aborted = false
    fetch('/api/auth/me', { cache: 'no-store', credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (aborted) return
        // 响应格式：{ ok, success, data: UserProfile }
        const profile = body?.data ?? null
        if (profile && typeof profile === 'object' && 'id' in profile) {
          setUser({
            id: profile.id,
            role: profile.role ?? null,
          })
        } else {
          setUser(null)
        }
      })
      .catch(() => {
        if (!aborted) setUser(null)
      })
    return () => {
      aborted = true
    }
  }, [])

  const codes = Array.isArray(code) ? code : [code]
  return codes.some((c) => checkLocal(user, c))
}
