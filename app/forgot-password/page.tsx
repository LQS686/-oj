'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Mail, AlertCircle, ArrowLeft, CheckCircle } from 'lucide-react'
import { fetchWithCookie } from '@/lib/api/base'
import { GuestAuthShell } from '@/components/common'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await fetchWithCookie('/api/auth/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      })

      const data = await response.json()

      if (data.success) {
        setSuccess(true)
      } else {
        setError(data.error || '发送失败')
      }
    } catch {
      setError('网络错误，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <GuestAuthShell>
      <div className="card-static rounded-lg p-8 md:p-10">
        <div className="flex items-center gap-3 mb-8">
          <Link href="/login" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h2 className="text-2xl font-extrabold text-foreground">忘记密码</h2>
            <p className="text-sm text-muted-foreground">重置你的密码</p>
          </div>
        </div>

        {success ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-8 h-8 text-success" />
            </div>
            <h3 className="text-xl font-bold text-foreground mb-2">邮件已发送</h3>
            <p className="text-muted-foreground mb-6">
              如果该邮箱已注册，你将收到包含临时新密码的邮件。
              <br />
              请检查收件箱和垃圾邮件文件夹。
            </p>
            <Link href="/login" className="btn-primary btn inline-flex">
              返回登录
            </Link>
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-6 p-4 rounded-xl bg-error/10 border border-error/20 text-error flex items-center gap-3">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <p className="text-muted-foreground mb-6">
              请输入你的注册邮箱，我们将发送临时新密码到该邮箱。
            </p>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-foreground mb-3">邮箱地址</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input pl-12 py-3.5"
                    placeholder="请输入注册邮箱"
                    required
                  />
                </div>
              </div>

              <button type="submit" disabled={loading} className="btn-primary btn w-full py-3.5 text-base">
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    发送中...
                  </>
                ) : (
                  '发送重置邮件'
                )}
              </button>
            </form>
          </>
        )}

        <div className="mt-8 text-center">
          <span className="text-muted-foreground">想起密码了？</span>
          <Link
            href="/login"
            className="text-primary-light hover:text-primary font-bold ml-1.5 transition-colors"
          >
            返回登录
          </Link>
        </div>
      </div>
    </GuestAuthShell>
  )
}
