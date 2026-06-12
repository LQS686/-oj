/**
 * hooks/useCurrentUser.ts
 * 客户端获取当前登录用户 - 走 SWR
 *
 * 使用：
 *   const { user, isLoading, error, mutate } = useCurrentUser()
 */
'use client'

import useSWR from 'swr'
import { swrKey } from '@/lib/api/swr'

export interface CurrentUser {
  id: string
  username: string
  email: string | null
  nickname: string | null
  avatar: string | null
  bio: string | null
  rating: number
  role: string
  createdAt: string
  updatedAt?: string
}

export function useCurrentUser() {
  const { data, error, isLoading, mutate } = useSWR<CurrentUser>(swrKey.me())
  return {
    user: data ?? null,
    isLoading,
    error,
    mutate, // 登录/登出后调用 mutate() 刷新
  }
}
