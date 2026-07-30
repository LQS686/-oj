'use client'

import { useState, useCallback } from 'react'
import { useDeferredEffect } from '@/hooks/useDeferredEffect'
import { useRouter } from 'next/navigation'
import { fetchWithCookie } from '@/lib/api/base'
import type { User } from '../_utils'

/**
 * 用户列表的数据获取 hook。
 * 处理初始加载、错误提示（含 403 跳转）与手动刷新。
 */
export function useUserList() {
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetchWithCookie('/api/admin/users')

      if (response.status === 403) {
        setError('需要管理员权限')
        setTimeout(() => router.push('/403'), 2000)
        return
      }

      const data = await response.json()
      if (data.success) {
        const payload = data.data
        setUsers(Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [])
      } else {
        setError(data.error || '获取用户列表失败')
        setUsers([])
      }
    } catch {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }, [router])

  useDeferredEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  return { users, loading, error, fetchUsers }
}
