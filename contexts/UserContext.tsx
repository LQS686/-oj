'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { authApi, type UserData } from '@/lib/api'

type User = UserData

interface UserContextType {
  user: User | null
  isLoading: boolean
  setUser: (user: User | null) => void
  login: (userData: User, token?: string) => void
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const UserContext = createContext<UserContextType | undefined>(undefined)

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') {
      setIsInitialized(true)
      return
    }

    const verifyUser = async () => {
      try {
        const userData = await authApi.getCurrentUser()
        setUser(userData)
      } catch (error) {
        setUser(null)
      } finally {
        setIsInitialized(true)
      }
    }

    verifyUser()
  }, [])

  const refreshUser = async () => {
    if (typeof window === 'undefined') return

    try {
      const userData = await authApi.getCurrentUser()
      setUser(userData)
    } catch (error) {
      console.error('刷新用户信息失败:', error)
      setUser(null)
    }
  }

  const login = (userData: User, token?: string) => {
    if (typeof window === 'undefined') return
    // Token 由后端通过 httpOnly cookie 设置，前端不再存储到 localStorage（避免 XSS 窃取）
    // 乐观更新：先用登录返回的用户信息渲染，再拉取完整资料
    setUser(userData)
    refreshUser()
  }

  const logout = async () => {
    if (typeof window === 'undefined') return

    try {
      await authApi.logout()
    } catch (error) {
      console.error('退出登录失败:', error)
    } finally {
      // Token cookie 由后端 /api/auth/logout 清除，前端无需处理
      setUser(null)
    }
  }

  return (
    <UserContext.Provider value={{ user, isLoading: !isInitialized, setUser, login, logout, refreshUser }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  const context = useContext(UserContext)
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider')
  }
  return context
}
