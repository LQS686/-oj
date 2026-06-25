'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import { fetchWithAuth } from '@/lib/api/base'
import { Settings, Save, Mail, Shield, Globe } from 'lucide-react'

interface SystemSettings {
 siteName: string
 siteDescription: string
 allowRegistration: boolean
 allowGuestSubmission: boolean
 defaultLanguage: string
 maxSubmissionSize: number
 smtpHost: string
 smtpPort: number
 smtpUser: string
 smtpFrom: string
}

export default function AdminSettingsPage() {
 const router = useRouter()
 const [loading, setLoading] = useState(true)
 const [saving, setSaving] = useState(false)
 const [error, setError] = useState('')
 const [success, setSuccess] = useState('')
 const [settings, setSettings] = useState<SystemSettings>({
 siteName: 'OJ Platform',
 siteDescription: '在线评测系统',
 allowRegistration: true,
 allowGuestSubmission: false,
 defaultLanguage: 'cpp',
 maxSubmissionSize: 65536,
 smtpHost: '',
 smtpPort: 587,
 smtpUser: '',
 smtpFrom: ''
 })

 useEffect(() => {
 fetchSettings()
 }, [])

 const fetchSettings = async () => {
 try {
 const response = await fetchWithAuth('/api/admin/settings')

 if (response.status === 403) {
 setError('需要管理员权限')
 setTimeout(() => router.push('/'), 2000)
 return
 }

 const data = await response.json()
 if (data.success && data.data) {
 setSettings(prev => ({ ...prev, ...data.data }))
 }
 } catch (err) {
 setError('网络错误')
 } finally {
 setLoading(false)
 }
 }

 const handleSave = async () => {
 setSaving(true)
 setError('')
 setSuccess('')

 try {
 const response = await fetchWithAuth('/api/admin/settings', {
 method: 'PUT',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(settings)
 })

 const data = await response.json()
 if (data.success) {
 setSuccess('设置已保存')
 setTimeout(() => setSuccess(''), 3000)
 } else {
 setError(data.error || '保存失败')
 }
 } catch (err) {
 setError('网络错误')
 } finally {
 setSaving(false)
 }
 }

 if (loading) {
 return (
 <AdminLayout>
 <div className="flex items-center justify-center min-h-screen">
 <div className="text-center">
 <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
 <p className="text-muted-foreground">加载中...</p>
 </div>
 </div>
 </AdminLayout>
 )
 }

 if (error && error.includes('权限')) {
 return (
 <AdminLayout>
 <div className="flex items-center justify-center min-h-screen">
 <div className="text-center">
 <p className="text-error text-lg mb-2">{error}</p>
 <p className="text-muted-foreground">正在跳转...</p>
 </div>
 </div>
 </AdminLayout>
 )
 }

 return (
 <AdminLayout>
 <div className="space-y-6">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-xl flex items-center justify-center"
 style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)' }}>
 <Settings className="w-5 h-5 text-white" />
 </div>
 <div>
 <h1 className="text-2xl font-bold text-foreground">系统设置</h1>
 <p className="text-sm text-muted-foreground">配置系统参数和选项</p>
 </div>
 </div>

 {error && !error.includes('权限') && (
 <div className="bg-error/10 border border-error/30 text-error px-4 py-3 rounded-lg">
 {error}
 </div>
 )}

 {success && (
 <div className="bg-secondary/10 border border-secondary/30 text-secondary px-4 py-3 rounded-lg">
 {success}
 </div>
 )}

 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
 <div className="card p-6">
 <div className="flex items-center gap-3 mb-6">
 <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary/20">
 <Globe className="w-4 h-4 text-primary-light" />
 </div>
 <h2 className="text-lg font-bold text-foreground">网站设置</h2>
 </div>

 <div className="space-y-4">
 <div>
 <label className="block text-sm font-medium text-muted-foreground mb-2">网站名称</label>
 <input
 type="text"
 value={settings.siteName}
 onChange={(e) => setSettings({ ...settings, siteName: e.target.value })}
 className="input"
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-muted-foreground mb-2">网站描述</label>
 <textarea
 value={settings.siteDescription}
 onChange={(e) => setSettings({ ...settings, siteDescription: e.target.value })}
 className="input min-h-[80px]"
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-muted-foreground mb-2">默认编程语言</label>
 <select
 value={settings.defaultLanguage}
 onChange={(e) => setSettings({ ...settings, defaultLanguage: e.target.value })}
 className="input"
 >
 <option value="cpp">C++</option>
 <option value="c">C</option>
 <option value="java">Java</option>
 <option value="python">Python</option>
 <option value="javascript">JavaScript</option>
 </select>
 </div>
 </div>
 </div>

 <div className="card p-6">
 <div className="flex items-center gap-3 mb-6">
 <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-secondary/10">
 <Shield className="w-4 h-4 text-secondary" />
 </div>
 <h2 className="text-lg font-bold text-foreground">权限设置</h2>
 </div>

 <div className="space-y-4">
 <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
 <div>
 <p className="text-foreground font-medium">允许注册</p>
 <p className="text-sm text-muted-foreground">允许新用户注册账号</p>
 </div>
 <label className="relative inline-flex items-center cursor-pointer">
 <input
 type="checkbox"
 checked={settings.allowRegistration}
 onChange={(e) => setSettings({ ...settings, allowRegistration: e.target.checked })}
 className="sr-only peer"
 />
 <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
 </label>
 </div>

 <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
 <div>
 <p className="text-foreground font-medium">允许游客提交</p>
 <p className="text-sm text-muted-foreground">允许未登录用户提交代码</p>
 </div>
 <label className="relative inline-flex items-center cursor-pointer">
 <input
 type="checkbox"
 checked={settings.allowGuestSubmission}
 onChange={(e) => setSettings({ ...settings, allowGuestSubmission: e.target.checked })}
 className="sr-only peer"
 />
 <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
 </label>
 </div>

 <div>
 <label className="block text-sm font-medium text-muted-foreground mb-2">最大提交代码大小 (KB)</label>
 <input
 type="number"
 value={settings.maxSubmissionSize}
 onChange={(e) => setSettings({ ...settings, maxSubmissionSize: parseInt(e.target.value) })}
 className="input"
 />
 </div>
 </div>
 </div>

 <div className="card p-6 lg:col-span-2">
 <div className="flex items-center gap-3 mb-6">
 <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-accent/10">
 <Mail className="w-4 h-4 text-accent" />
 </div>
 <h2 className="text-lg font-bold text-foreground">邮件设置</h2>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div>
 <label className="block text-sm font-medium text-muted-foreground mb-2">SMTP 服务器</label>
 <input
 type="text"
 value={settings.smtpHost}
 onChange={(e) => setSettings({ ...settings, smtpHost: e.target.value })}
 placeholder="smtp.example.com"
 className="input"
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-muted-foreground mb-2">SMTP 端口</label>
 <input
 type="number"
 value={settings.smtpPort}
 onChange={(e) => setSettings({ ...settings, smtpPort: parseInt(e.target.value) })}
 className="input"
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-muted-foreground mb-2">SMTP 用户名</label>
 <input
 type="text"
 value={settings.smtpUser}
 onChange={(e) => setSettings({ ...settings, smtpUser: e.target.value })}
 className="input"
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-muted-foreground mb-2">发件人地址</label>
 <input
 type="email"
 value={settings.smtpFrom}
 onChange={(e) => setSettings({ ...settings, smtpFrom: e.target.value })}
 placeholder="noreply@example.com"
 className="input"
 />
 </div>
 </div>
 </div>
 </div>

 <div className="flex justify-end">
 <button
 onClick={handleSave}
 disabled={saving}
 className="btn btn-primary flex items-center gap-2"
 >
 {saving ? (
 <>
 <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
 保存中...
 </>
 ) : (
 <>
 <Save className="w-5 h-5" />
 保存设置
 </>
 )}
 </button>
 </div>
 </div>
 </AdminLayout>
 )
}
