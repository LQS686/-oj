'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { authApi } from '@/lib/api'

interface User {
  id: string
  username: string
  email: string
  nickname?: string
  avatar?: string
  bio?: string
  rating: number
  rank: string
  color: string
  role: string
  createdAt: string
}

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

  const login = (userData: User, token?: string) => {
    if (typeof window === 'undefined') return
    if (token) {
      localStorage.setItem('token', token)
    }
    setUser(userData)
  }

  const logout = async () => {
    if (typeof window === 'undefined') return
    
    try {
      await authApi.logout()
    } catch (error) {
      console.error('退出登录失败:', error)
    } finally {
      localStorage.removeItem('token')
      setUser(null)
    }
  }

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
