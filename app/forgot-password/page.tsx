'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Code2, Mail, Sparkles, AlertCircle, ArrowLeft, CheckCircle } from 'lucide-react'
import { useSettings } from '@/contexts/SettingsContext'

export default function ForgotPasswordPage() {
 const { settings } = useSettings()
 const [email, setEmail] = useState('')
 const [error, setError] = useState('')
 const [success, setSuccess] = useState(false)
 const [loading, setLoading] = useState(false)

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault()
 setError('')
 setLoading(true)

 try {
 const response = await fetch('/api/auth/forgot-password', {
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
 } catch (err) {
 setError('网络错误，请稍后重试')
 } finally {
 setLoading(false)
 }
 }

 return (
 <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
 <div className="absolute inset-0">
 <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-primary/10 rounded-full"></div>
 <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-secondary/10 rounded-full" style={{ animationDelay: '2s' }}></div>
 </div>
 
 <div className="w-full max-w-md relative z-10">
 <div className="text-center mb-10">
 <Link href="/" className="inline-flex items-center gap-3 group">
 <div className="relative">
 <div className="absolute inset-0 bg-primary blur-xl opacity-40 group-hover:opacity-60 transition-opacity rounded-lg"></div>
 <div className="relative w-14 h-14 bg-primary rounded-lg flex items-center justify-center shadow-xl">
 <Code2 className="w-7 h-7 text-white" />
 </div>
 </div>
 <div className="text-left">
 <span className="text-2xl font-extrabold text-foreground">{settings.siteName}</span>
 <p className="text-xs text-muted-foreground">{settings.siteDescription}</p>
 </div>
 </Link>
 </div>

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
 <label className="block text-sm font-semibold text-foreground mb-3">
 邮箱地址
 </label>
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

 <button
 type="submit"
 disabled={loading}
 className="btn-primary btn w-full py-3.5 text-base"
 >
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
 <Link href="/login" className="text-primary-light hover:text-primary font-bold ml-1.5 transition-colors">
 返回登录
 </Link>
 </div>
 </div>
 </div>
 </div>
 )
}
