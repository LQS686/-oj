'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Code2, Mail, Lock, Eye, EyeOff, Sparkles, AlertCircle } from 'lucide-react'
import { useUser } from '@/contexts/UserContext'
import { useSettings } from '@/contexts/SettingsContext'
import { authApi } from '@/lib/api/auth'

export default function LoginPage() {
  const router = useRouter()
  const { login } = useUser()
  const { settings } = useSettings()
  const [showPassword, setShowPassword] = useState(false)
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await authApi.login(formData.username, formData.password)
      login(result.user, result.token)
      router.push('/')
    } catch (err: any) {
      setError(err.message || '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[150px] animate-pulse-slow"></div>
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-secondary/10 rounded-full blur-[120px] animate-pulse-slow" style={{ animationDelay: '2s' }}></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-accent/5 rounded-full blur-[200px]"></div>
      </div>
      
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-10">
          <Link href="/" className="inline-flex items-center gap-3 group">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-primary to-secondary blur-xl opacity-40 group-hover:opacity-60 transition-opacity rounded-2xl animate-pulse-slow"></div>
              <div className="relative w-14 h-14 bg-gradient-to-br from-primary to-primary-dark rounded-2xl flex items-center justify-center shadow-xl shadow-primary/30 group-hover:scale-110 transition-transform duration-300">
                <Code2 className="w-7 h-7 text-white" />
              </div>
            </div>
            <div className="text-left">
              <span className="text-2xl font-extrabold gradient-text group-hover:glow transition-all duration-300">{settings.siteName}</span>
              <p className="text-xs text-muted-foreground group-hover:text-primary/70 transition-colors duration-300">{settings.siteDescription}</p>
            </div>
          </Link>
          <p className="text-muted-foreground mt-6 text-lg">欢迎回来，继续你的编程之旅</p>
        </div>

        <div className="glass-strong rounded-3xl p-6 md:p-10 shadow-2xl shadow-primary/10 hover:shadow-primary/20 transition-all duration-300 animate-fadeIn">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center shadow-lg shadow-primary/30 animate-pulse-slow">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-extrabold text-foreground">登录</h2>
              <p className="text-sm text-muted-foreground">登录你的账号</p>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-error/10 border border-error/20 text-error flex items-center gap-3 animate-fadeIn">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-foreground mb-3">
                用户名或邮箱
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="input pl-12 py-3.5 hover:border-primary/30 transition-colors duration-300"
                  placeholder="请输入用户名或邮箱"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-foreground mb-3">
                密码
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="input pl-12 pr-12 py-3.5 hover:border-primary/30 transition-colors duration-300"
                  placeholder="请输入密码"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors duration-300 group"
                >
                  {showPassword ? <EyeOff className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" /> : <Eye className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" />}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  className="w-4 h-4 text-primary border-border rounded focus:ring-primary bg-muted accent-primary"
                />
                <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors duration-300">记住我</span>
              </label>
              <Link href="/forgot-password" className="text-sm text-primary-light hover:text-primary font-medium transition-colors duration-300 group">
                <span className="group-hover:underline">忘记密码？</span>
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary btn w-full py-3.5 text-base group"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  登录中...
                </>
              ) : (
                <span className="group-hover:scale-105 transition-transform duration-300">登录</span>
              )}
            </button>
          </form>

          <div className="mt-8 text-center">
            <span className="text-muted-foreground">还没有账号？</span>
            <Link href="/register" className="text-primary-light hover:text-primary font-bold ml-1.5 transition-colors duration-300 group">
              <span className="group-hover:scale-105 transition-transform duration-300">立即注册</span>
            </Link>
          </div>

          <div className="mt-8 p-5 rounded-xl bg-gradient-to-br from-primary/5 to-secondary/5 border border-primary/10 hover:border-primary/20 transition-all duration-300">
            <p className="text-sm text-primary-light font-semibold mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 animate-pulse-slow" />
              测试账号
            </p>
            <div className="text-sm text-muted-foreground space-y-3">
              <p className="flex flex-wrap items-center justify-between gap-2">
                <span>管理员:</span>
                <code className="bg-muted/50 px-3 py-1.5 rounded-lg border border-border font-mono text-foreground text-xs hover:border-primary/30 transition-colors duration-300">admin / admin123</code>
              </p>
              <p className="flex flex-wrap items-center justify-between gap-2">
                <span>普通用户:</span>
                <code className="bg-muted/50 px-3 py-1.5 rounded-lg border border-border font-mono text-foreground text-xs hover:border-primary/30 transition-colors duration-300">user1 / user123</code>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
