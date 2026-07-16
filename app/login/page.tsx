'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Mail, Lock, Eye, EyeOff, Sparkles, AlertCircle } from 'lucide-react'
import { useUser } from '@/contexts/UserContext'
import { useSettings } from '@/contexts/SettingsContext'
import { authApi } from '@/lib/api/auth'

export default function LoginPage() {
 const router = useRouter()
 const { login } = useUser()
 const { settings } = useSettings()
 const [showPassword, setShowPassword] = useState(false)
 const [rememberMe, setRememberMe] = useState(false)
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
 const result = await authApi.login(formData.username, formData.password, rememberMe)
 login(result.user, result.token)
 const returnUrl = new URLSearchParams(window.location.search).get('returnUrl')
 router.replace(returnUrl || '/')
 } catch (err: any) {
 setError(err.message || '登录失败')
 } finally {
 setLoading(false)
 }
 }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <Link href="/" className="inline-flex items-center gap-3 group">
            <div className="w-14 h-14 rounded-xl overflow-hidden flex items-center justify-center bg-white shadow-md ring-1 ring-border/40">
              <img
                src="/logos/dsojlogo.png"
                alt="大山 OJ Logo"
                width={56}
                height={56}
                className="w-full h-full object-contain transition-transform duration-200 group-hover:scale-105"
              />
            </div>
            <div className="text-left">
              <span className="text-2xl font-extrabold text-foreground">{settings.siteName}</span>
              <p className="text-xs text-muted-foreground">{settings.siteDescription}</p>
            </div>
          </Link>
          <p className="text-muted-foreground mt-6 text-lg">欢迎回来，继续你的编程之旅</p>
        </div>

        <div className="card-static rounded-lg p-6 md:p-10 shadow-2xl transition-all duration-300 animate-modal-in">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-extrabold text-foreground">登录</h2>
              <p className="text-sm text-muted-foreground">登录你的账号</p>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-error/10 border border-error/20 text-error flex items-center gap-3 animate-modal-in">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="login-username" className="block text-sm font-semibold text-foreground mb-3">
                用户名或邮箱
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground transition-colors duration-200 peer-focus:text-primary" />
                <input
                  id="login-username"
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="input pl-12 py-3.5 hover:border-primary/30 transition-all duration-200"
                  placeholder="请输入用户名或邮箱"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="block text-sm font-semibold text-foreground mb-3">
                密码
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground transition-colors duration-200" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="input pl-12 pr-12 py-3.5 hover:border-primary/30 transition-all duration-200"
                  placeholder="请输入密码"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-all duration-200 hover:scale-110"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 text-primary border-border rounded focus:ring-primary bg-muted accent-primary"
                />
                <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors duration-200">记住我</span>
              </label>
              <Link href="/forgot-password" className="text-sm text-primary-light hover:text-primary font-medium transition-colors duration-200 group">
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
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-icon-spin" />
                  登录中...
                </>
              ) : (
                <span className="transition-transform duration-200 group-hover:scale-105">登录</span>
              )}
            </button>
          </form>

          <div className="mt-8 text-center">
            <span className="text-muted-foreground">还没有账号？</span>
            <Link href="/register" className="text-primary-light hover:text-primary font-bold ml-1.5 transition-colors duration-200 group">
              <span className="group-hover:underline">立即注册</span>
            </Link>
          </div>

          {/* 欢迎提示卡片：面向终端用户，不暴露后台管理员机制 */}
          <div className="mt-8 p-5 rounded-xl bg-primary/5 border border-primary/10 hover:border-primary/20 transition-all duration-300 hover:shadow-sm">
            <p className="text-sm text-primary-light font-semibold mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              欢迎来到大山 OJ
            </p>
            <div className="text-sm text-muted-foreground space-y-2">
              <p>
                代码如山，算法为径。在这里开启你的算法攀登之旅——从入门到顶峰，逐步攻克每一道难题。
              </p>
              <p className="text-xs text-muted-foreground/70">
                支持多种编程语言在线评测、竞赛训练与学习成长追踪。
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
