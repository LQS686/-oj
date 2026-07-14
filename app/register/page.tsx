'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Code2, CheckCircle2, XCircle, User, Mail, Lock, Eye, EyeOff, Sparkles } from 'lucide-react'
import { useUser } from '@/contexts/UserContext'
import { useSettings } from '@/contexts/SettingsContext'
import { authApi } from '@/lib/api/auth'

export default function RegisterPage() {
 const router = useRouter()
 const { login } = useUser()
 const { settings } = useSettings()
 const [showPassword, setShowPassword] = useState(false)
 const [showConfirmPassword, setShowConfirmPassword] = useState(false)
 const [formData, setFormData] = useState({
 username: '',
 email: '',
 password: '',
 confirmPassword: '',
 nickname: '',
 })
 const [error, setError] = useState('')
 const [loading, setLoading] = useState(false)
 const [passwordStrength, setPasswordStrength] = useState(0)

 const validatePassword = (password: string) => {
 let strength = 0
 if (password.length >= 6) strength++
 if (password.length >= 8) strength++
 if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++
 if (/\d/.test(password)) strength++
 if (/[^a-zA-Z\d]/.test(password)) strength++
 setPasswordStrength(strength)
 }

 const handlePasswordChange = (password: string) => {
 setFormData({ ...formData, password })
 validatePassword(password)
 }

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault()
 setError('')

 if (formData.password !== formData.confirmPassword) {
 setError('两次输入的密码不一致')
 return
 }

 if (formData.password.length < 6) {
 setError('密码长度至少为6位')
 return
 }

 setLoading(true)

 try {
 const result = await authApi.register({
 username: formData.username,
 email: formData.email,
 password: formData.password,
 nickname: formData.nickname || formData.username,
 })
 login(result.user, result.token)
 router.push('/')
 } catch (err: any) {
 setError(err.message || '注册失败')
 } finally {
 setLoading(false)
 }
 }

 const getPasswordStrengthText = () => {
 if (passwordStrength === 0) return { text: '太弱', color: 'text-muted-foreground' }
 if (passwordStrength <= 2) return { text: '弱', color: 'text-error' }
 if (passwordStrength === 3) return { text: '中等', color: 'text-accent' }
 if (passwordStrength === 4) return { text: '强', color: 'text-secondary-light' }
 return { text: '非常强', color: 'text-secondary-light' }
 }

 const getStrengthColor = () => {
 if (passwordStrength <= 2) return 'bg-error'
 if (passwordStrength === 3) return 'bg-accent'
 return 'bg-secondary'
 }

 const strengthInfo = getPasswordStrengthText()
 const strengthColor = getStrengthColor()

  return (
    <div className="min-h-screen flex items-center justify-center p-4 py-8 relative overflow-hidden">
      <div className="absolute inset-0">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-secondary/10 rounded-full animate-float"></div>
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-primary/10 rounded-full animate-float" style={{ animationDelay: '2s' }}></div>
      </div>
      
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-10">
          <Link href="/" className="inline-flex items-center gap-3 group">
            <div className="relative">
              <div className="absolute inset-0 bg-primary blur-xl opacity-40 group-hover:opacity-60 transition-opacity rounded-lg"></div>
              <div className="relative w-14 h-14 bg-primary rounded-lg flex items-center justify-center shadow-xl transition-all duration-300 group-hover:scale-110 group-hover:rotate-3">
                <Code2 className="w-7 h-7 text-white" />
              </div>
            </div>
            <div className="text-left">
              <span className="text-2xl font-extrabold text-foreground transition-all duration-300">{settings.siteName}</span>
              <p className="text-xs text-muted-foreground group-hover:text-primary/70 transition-colors duration-300">{settings.siteDescription}</p>
            </div>
          </Link>
          <p className="text-muted-foreground mt-6 text-lg animate-fadeIn">加入我们，开启编程之旅</p>
        </div>

        <div className="card-static rounded-lg p-6 md:p-10 shadow-2xl transition-all duration-300 animate-modal-in">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center shadow-lg transition-transform duration-300 hover:scale-110 hover:rotate-6">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-extrabold text-foreground">注册账号</h2>
              <p className="text-sm text-muted-foreground">创建你的账号</p>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-error/10 border border-error/20 text-error flex items-center gap-3 animate-modal-in">
              <XCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="reg-username" className="block text-sm font-semibold text-foreground mb-2.5">
                用户名 <span className="text-error">*</span>
              </label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground transition-colors duration-200" />
                <input
                  id="reg-username"
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="input pl-12 py-3 hover:border-primary/30 transition-all duration-200"
                  placeholder="3-20位字母、数字或下划线"
                  pattern="[a-zA-Z0-9_]{3,20}"
                  required
                />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">用户名将用于登录和显示</p>
            </div>

            <div>
              <label htmlFor="reg-email" className="block text-sm font-semibold text-foreground mb-2.5">
                邮箱 <span className="text-error">*</span>
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground transition-colors duration-200" />
                <input
                  id="reg-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="input pl-12 py-3 hover:border-primary/30 transition-all duration-200"
                  placeholder="your@email.com"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="reg-nickname" className="block text-sm font-semibold text-foreground mb-2.5">
                昵称（可选）
              </label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground transition-colors duration-200" />
                <input
                  id="reg-nickname"
                  type="text"
                  value={formData.nickname}
                  onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                  className="input pl-12 py-3 hover:border-primary/30 transition-all duration-200"
                  placeholder="显示名称，默认为用户名"
                />
              </div>
            </div>

            <div>
              <label htmlFor="reg-password" className="block text-sm font-semibold text-foreground mb-2.5">
                密码 <span className="text-error">*</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground transition-colors duration-200" />
                <input
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => handlePasswordChange(e.target.value)}
                  className="input pl-12 pr-12 py-3 hover:border-primary/30 transition-all duration-200"
                  placeholder="至少6位密码"
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
              {formData.password && (
                <div className="mt-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ease-out ${strengthColor}`}
                        style={{ width: `${(passwordStrength / 5) * 100}%` }}
                      />
                    </div>
                    <span className={`text-xs font-semibold ${strengthInfo.color}`}>
                      {strengthInfo.text}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label htmlFor="reg-confirm-password" className="block text-sm font-semibold text-foreground mb-2.5">
                确认密码 <span className="text-error">*</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground transition-colors duration-200" />
                <input
                  id="reg-confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  className="input pl-12 pr-12 py-3 hover:border-primary/30 transition-all duration-200"
                  placeholder="再次输入密码"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={showConfirmPassword ? '隐藏密码' : '显示密码'}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-all duration-200 hover:scale-110"
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {formData.confirmPassword && (
                <div className="mt-2 flex items-center gap-1.5 text-xs animate-fadeIn">
                  {formData.password === formData.confirmPassword ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-secondary-light" />
                      <span className="text-secondary-light">密码匹配</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 text-error" />
                      <span className="text-error">密码不匹配</span>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-start gap-2.5">
              <input
                type="checkbox"
                className="w-4 h-4 text-primary border-border rounded focus:ring-primary bg-muted accent-primary mt-0.5"
                required
              />
              <label className="text-sm text-muted-foreground">
                我已阅读并同意
                <Link href="/terms" className="text-primary-light hover:text-primary mx-1 transition-colors duration-200 group">
                  <span className="group-hover:underline">服务条款</span>
                </Link>
                和
                <Link href="/privacy" className="text-primary-light hover:text-primary mx-1 transition-colors duration-200 group">
                  <span className="group-hover:underline">隐私政策</span>
                </Link>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary btn w-full py-3.5 text-base group"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-icon-spin" />
                  注册中...
                </>
              ) : (
                <span className="transition-transform duration-200 group-hover:scale-105">注册</span>
              )}
            </button>
          </form>

          <div className="mt-8 text-center">
            <span className="text-muted-foreground">已有账号？</span>
            <Link href="/login" className="text-primary-light hover:text-primary font-bold ml-1.5 transition-colors duration-200 group">
              <span className="group-hover:underline">立即登录</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
