'use client'

import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react'
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

  const refreshUser = useCallback(async () => {
    if (typeof window === 'undefined') return

    try {
      const userData = await authApi.getCurrentUser()
      setUser(userData)
    } catch (error) {
      console.error('刷新用户信息失败:', error)
      setUser(null)
    }
  }, [])

  const login = useCallback((userData: User, token?: string) => {
    if (typeof window === 'undefined') return
    setUser(userData)
    void refreshUser()
  }, [refreshUser])

  const logout = useCallback(async () => {
    if (typeof window === 'undefined') return

    try {
      await authApi.logout()
    } catch (error) {
      console.error('退出登录失败:', error)
    } finally {
      setUser(null)
    }
  }, [])

  const value = useMemo(() => ({
    user,
    isLoading: !isInitialized,
    setUser,
    login,
    logout,
    refreshUser,
  }), [user, isInitialized, login, logout, refreshUser])

  return (
    <UserContext.Provider value={value}>
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
