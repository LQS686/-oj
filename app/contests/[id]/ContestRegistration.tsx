'use client'

import { useState, useCallback } from 'react'
import { useDeferredEffect } from '@/hooks/useDeferredEffect'
import { useRouter } from 'next/navigation'
import { Lock, UserCheck, AlertCircle, LogIn, Play } from 'lucide-react'
import { fetchWithCookie } from '@/lib/api/base'
import { useUser } from '@/contexts/UserContext'
import { loginPath } from '@/lib/navigation'
import { useWallClock } from '@/hooks/useWallClock'

interface Contest {
  id: string
  title: string
  type: string
  startTime: Date | string
  endTime: Date | string
  isPublic: boolean
  /** 是否需要密码/邀请码报名（永不下发 password 原文/哈希） */
  hasPassword?: boolean
}

export default function ContestRegistration({ contest }: { contest: Contest }) {
  const router = useRouter()
  const { user, isLoading: authLoading } = useUser()
  const [loading, setLoading] = useState(true)
  const [isRegistered, setIsRegistered] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [registering, setRegistering] = useState(false)
  const isLoggedIn = !!user
  const startMs = new Date(contest.startTime).getTime()
  const [clockActive, setClockActive] = useState(() => Date.now() < startMs)
  const nowMs = useWallClock(clockActive)

  useDeferredEffect(() => {
    if (nowMs >= startMs) setClockActive(false)
  }, [nowMs, startMs])

  const checkStatus = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetchWithCookie(`/api/contests/${contest.id}`)
      const data = await res.json()
      if (data.success) {
        setIsRegistered(!!data.data.isRegistered)
      }
    } catch (err) {
      console.error('Check status failed', err)
    } finally {
      setLoading(false)
    }
  }, [contest.id])

  useDeferredEffect(() => {
    void checkStatus()
  }, [checkStatus])

  const handleRegister = async () => {
    try {
      setRegistering(true)
      setError('')
      const res = await fetchWithCookie(`/api/contests/${contest.id}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      if (data.success) {
        setIsRegistered(true)
        router.refresh()
      } else {
        setError(data.error || '报名失败')
      }
    } catch {
      setError('网络错误，请稍后重试')
    } finally {
      setRegistering(false)
    }
  }

  if (loading || authLoading) {
    return (
      <div className="card-static rounded-xl p-4">
        <div className="skeleton h-24 rounded-lg" />
      </div>
    )
  }

  if (!isLoggedIn) {
    return (
      <div className="card-static rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <LogIn className="w-5 h-5 text-primary-light" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">请先登录</h3>
            <p className="text-xs text-muted-foreground mt-0.5">登录后即可报名参赛</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => router.push(loginPath(`/contests/${contest.id}`))}
          className="btn btn-primary w-full"
        >
          <LogIn className="w-4 h-4" />
          去登录
        </button>
      </div>
    )
  }

  if (isRegistered) {
    const isStarted = startMs <= nowMs
    return (
      <div className="card-static rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center shrink-0">
            <UserCheck className="w-5 h-5 text-secondary-light" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-secondary-light">已报名</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isStarted ? '比赛进行中，可进入答题' : '开赛后可进入题目列表'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => router.push(`/contests/${contest.id}/problems`)}
          disabled={!isStarted}
          className={`btn w-full ${
            !isStarted ? 'btn-ghost opacity-50 cursor-not-allowed' : 'btn-secondary'
          }`}
        >
          <Play className="w-4 h-4" />
          {!isStarted ? '等待比赛开始' : '进入比赛'}
        </button>
      </div>
    )
  }

  return (
    <div className="card-static rounded-xl p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">报名参赛</h3>
        {contest.hasPassword ? (
          <p className="text-xs text-muted-foreground mt-1">请输入竞赛密码后报名</p>
        ) : (
          <p className="text-xs text-muted-foreground mt-1">公开赛，确认后即可报名</p>
        )}
      </div>

      {contest.hasPassword && (
        <div className="relative">
          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input pl-10 py-2.5 text-sm"
            placeholder="邀请码或密码"
          />
        </div>
      )}

      {error && (
        <div className="p-2.5 bg-error/10 text-error rounded-lg text-xs flex items-center gap-2 border border-error/20">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={() => void handleRegister()}
        disabled={registering}
        className={`btn w-full ${
          registering ? 'btn-ghost opacity-50 cursor-not-allowed' : 'btn-primary'
        }`}
      >
        {registering ? '正在报名...' : '立即报名'}
      </button>
    </div>
  )
}
