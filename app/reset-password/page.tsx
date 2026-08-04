'use client'

import { useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Lock, AlertCircle, ArrowLeft, CheckCircle, Loader2 } from 'lucide-react'
import { fetchWithCookie } from '@/lib/api/base'
import { GuestAuthShell } from '@/components/common'

function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token') || ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('密码长度至少为8位')
      return
    }
    if (password !== confirm) {
      setError('两次输入的密码不一致')
      return
    }

    setLoading(true)
    try {
      const response = await fetchWithCookie('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await response.json()

      if (data.success) {
        setSuccess(true)
        setTimeout(() => router.push('/login'), 1500)
      } else {
        setError(data.error || '重置失败')
      }
    } catch {
      setError('网络错误，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="text-center py-8">
        <AlertCircle className="w-12 h-12 text-error mx-auto mb-4" />
        <h3 className="text-xl font-bold text-foreground mb-2">链接无效</h3>
        <p className="text-muted-foreground mb-6">重置链接缺失或已损坏，请重新发起密码重置。</p>
        <Link href="/forgot-password" className="btn-primary btn inline-flex">
          重新发起
        </Link>
      </div>
    )
  }

  return (
    <div className="card-static rounded-lg p-8 md:p-10">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/login" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h2 className="text-2xl font-extrabold text-foreground">重置密码</h2>
          <p className="text-sm text-muted-foreground">设置你的新密码</p>
        </div>
      </div>

      {success ? (
        <div className="text-center py-8">
          <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-8 h-8 text-success" />
          </div>
          <h3 className="text-xl font-bold text-foreground mb-2">密码重置成功</h3>
          <p className="text-muted-foreground mb-6">即将跳转到登录页，请使用新密码登录。</p>
        </div>
      ) : (
        <>
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-error/10 border border-error/20 text-error flex items-center gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-foreground mb-3">新密码</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pl-12 py-3.5"
                  placeholder="至少 8 位，含字母和数字"
                  required
                  minLength={8}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-foreground mb-3">确认新密码</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="input pl-12 py-3.5"
                  placeholder="再次输入新密码"
                  required
                  minLength={8}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary btn w-full py-3.5 text-base flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  提交中...
                </>
              ) : (
                '重置密码'
              )}
            </button>
          </form>
        </>
      )}
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <GuestAuthShell>
      <Suspense fallback={<div className="card-static rounded-lg p-8 text-center text-muted-foreground">加载中…</div>}>
        <ResetPasswordForm />
      </Suspense>
    </GuestAuthShell>
  )
}
