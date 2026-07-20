'use client'

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react'
import { authApi, type UserData } from '@/lib/api'
import { logger } from '@/lib/logger'

type User = UserData

/**
 * 跨标签页登录态同步事件
 *
 * 项目约束：tokens 不能存 localStorage，但 cookie 自动跨标签共享。
 * 我们用 BroadcastChannel（不可用时回退 storage event）广播 'login' / 'logout' 事件，
 * 其它标签页收到后调用 refreshUser / 清空 user，避免显示陈旧的登录态。
 *
 * 事件载荷带 originTabId，防止本标签页自己消费自己发出的事件。
 */
type AuthSyncEvent =
  | { type: 'login'; originTabId: string }
  | { type: 'logout'; originTabId: string }
  | { type: 'refresh'; originTabId: string }

const AUTH_CHANNEL_NAME = 'dsoj-auth-sync'
// storage event 兜底用：BroadcastChannel 在部分老旧浏览器不可用
const AUTH_STORAGE_KEY = '__dsoj_auth_sync__'

interface UserContextType {
  user: User | null
  isLoading: boolean
  setUser: (user: User | null) => void
  login: (userData: User, token?: string) => void
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const UserContext = createContext<UserContextType | undefined>(undefined)

/** 生成本标签页唯一 ID（crypto.randomBytes 项目约束在浏览器侧用 crypto.randomUUID/getRandomValues） */
function generateTabId(): string {
  if (typeof window === 'undefined') return 'ssr'
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    // 回退到 Math.random + Date.now（仅作为非安全用途的标签页标识）
  }
  return `tab_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const tabIdRef = useRef<string>('')

  // 初始化标签页 ID
  useEffect(() => {
    tabIdRef.current = generateTabId()
  }, [])

  const refreshUser = useCallback(async () => {
    if (typeof window === 'undefined') return

    try {
      const userData = await authApi.getCurrentUser()
      setUser(userData)
    } catch (error) {
      logger.debug('刷新用户信息失败', { error: error instanceof Error ? error.message : String(error) })
      setUser(null)
    }
  }, [])

  // 初始化：校验当前登录态
  useEffect(() => {
    if (typeof window === 'undefined') {
      setIsInitialized(true)
      return
    }

    const verifyUser = async () => {
      try {
        const userData = await authApi.getCurrentUser()
        setUser(userData)
      } catch {
        setUser(null)
      } finally {
        setIsInitialized(true)
      }
    }

    verifyUser()
  }, [])

  // 跨标签页同步：监听 BroadcastChannel + storage event 双通道
  useEffect(() => {
    if (typeof window === 'undefined') return

    let channel: BroadcastChannel | null = null
    const handleSyncEvent = (evt: AuthSyncEvent) => {
      // 忽略本标签页自己发出的事件，避免重复 refreshUser
      if (!evt || evt.originTabId === tabIdRef.current) return

      if (evt.type === 'login' || evt.type === 'refresh') {
        // 其它标签页登录/刷新 → 拉取最新登录态
        void refreshUser()
      } else if (evt.type === 'logout') {
        // 其它标签页登出 → 立即清空本标签页状态（cookie 已被服务端清除，无需调 /auth/me）
        setUser(null)
      }
    }

    // 优先使用 BroadcastChannel
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        channel = new BroadcastChannel(AUTH_CHANNEL_NAME)
        channel.onmessage = (e: MessageEvent) => {
          handleSyncEvent(e.data as AuthSyncEvent)
        }
      } catch {
        channel = null
      }
    }

    // storage event 兜底（BroadcastChannel 不可用时仍能跨标签同步）
    const onStorage = (e: StorageEvent) => {
      if (e.key !== AUTH_STORAGE_KEY || !e.newValue) return
      try {
        const evt = JSON.parse(e.newValue) as AuthSyncEvent
        handleSyncEvent(evt)
      } catch {
        // 忽略解析失败
      }
    }
    window.addEventListener('storage', onStorage)

    return () => {
      if (channel) {
        try {
          channel.close()
        } catch {
          // 忽略关闭错误
        }
      }
      window.removeEventListener('storage', onStorage)
    }
  }, [refreshUser])

  /** 广播登录态变更事件到其它标签页 */
  const broadcast = useCallback((evt: Omit<AuthSyncEvent, 'originTabId'>) => {
    if (typeof window === 'undefined') return
    const full: AuthSyncEvent = { ...evt, originTabId: tabIdRef.current } as AuthSyncEvent

    // BroadcastChannel
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const ch = new BroadcastChannel(AUTH_CHANNEL_NAME)
        ch.postMessage(full)
        ch.close()
      }
    } catch {
      // 忽略
    }

    // storage event 兜底：写入 localStorage 触发其它标签页的 storage 事件
    // 注意：这里存的是事件标识（非 token），不违反"token 不存 localStorage"约束
    try {
      // 用时间戳保证每次写入都触发 storage 事件（同值不触发）
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ ...full, _ts: Date.now() }))
    } catch {
      // 忽略
    }
  }, [])

  const login = useCallback((userData: User, _token?: string) => {
    if (typeof window === 'undefined') return
    setUser(userData)
    void refreshUser()
    broadcast({ type: 'login' })
  }, [refreshUser, broadcast])

  const logout = useCallback(async () => {
    if (typeof window === 'undefined') return

    try {
      await authApi.logout()
    } catch (error) {
      logger.debug('退出登录失败', { error: error instanceof Error ? error.message : String(error) })
    } finally {
      setUser(null)
      broadcast({ type: 'logout' })
    }
  }, [broadcast])

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
