'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { fetchWithAuth } from '@/lib/api/base'
import { Save, Mail, Shield, Globe, Send } from 'lucide-react'
import type { SystemSettings } from '@/lib/settings'

export default function AdminSettingsPage() {
 const router = useRouter()
 const [loading, setLoading] = useState(true)
 const [saving, setSaving] = useState(false)
 const [error, setError] = useState('')
 const [success, setSuccess] = useState('')
 const [settings, setSettings] = useState<SystemSettings>({
 siteName: '大山 OJ',
 siteDescription: '代码如山·算法为径·陪你从入门到顶峰',
 allowRegistration: true,
 allowGuestSubmission: false,
 defaultLanguage: 'cpp',
 maxSubmissionSize: 65536,
 smtpHost: '',
 smtpPort: 465,
 smtpUser: '',
 smtpFrom: '',
 smtpPassword: '',
 smtpSecure: true
 })
 const [testEmail, setTestEmail] = useState('')
 const [testingEmail, setTestingEmail] = useState(false)
 const [testResult, setTestResult] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

 useEffect(() => {
 fetchSettings()
 }, [])

 const fetchSettings = async () => {
 try {
 const response = await fetchWithAuth('/api/admin/settings')

 if (response.status === 403) {
 setError('需要管理员权限')
 setTimeout(() => router.push('/403'), 2000)
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

 const handleTestEmail = async () => {
 if (!testEmail) {
 setTestResult({ type: 'error', msg: '请输入收件邮箱' })
 return
 }
 setTestingEmail(true)
 setTestResult(null)
 try {
 const response = await fetchWithAuth('/api/admin/settings/test-email', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ email: testEmail })
 })
 const data = await response.json()
 if (data.success) {
 setTestResult({ type: 'success', msg: '测试邮件已发送，请查收' })
 } else {
 setTestResult({ type: 'error', msg: data.error || '发送失败' })
 }
 } catch (err) {
 setTestResult({ type: 'error', msg: '网络错误' })
 } finally {
 setTestingEmail(false)
 }
 }

 // QQ 邮箱一键填充：smtp.qq.com + SSL + 465
 const fillQqMail = () => {
 setSettings(prev => ({
 ...prev,
 smtpHost: 'smtp.qq.com',
 smtpPort: 465,
 smtpSecure: true
 }))
 }

 if (loading) {
 return (
 <div className="flex items-center justify-center min-h-screen">
 <div className="text-center">
 <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
 <p className="text-muted-foreground">加载中...</p>
 </div>
 </div>
 )
 }

 if (error && error.includes('权限')) {
 return (
 <div className="flex items-center justify-center min-h-screen">
 <div className="text-center">
 <p className="text-error text-lg mb-2">{error}</p>
 <p className="text-muted-foreground">正在跳转...</p>
 </div>
 </div>
 )
 }

 return (
 <div className="space-y-6">
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
 <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
 <div className="flex items-center gap-3">
 <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-accent/10">
 <Mail className="w-4 h-4 text-accent" />
 </div>
 <h2 className="text-lg font-bold text-foreground">邮件设置</h2>
 </div>
 <button
 onClick={fillQqMail}
 className="btn btn-secondary text-sm flex items-center gap-2"
 title="一键填充 QQ 邮箱 SMTP 参数（smtp.qq.com / 465 / SSL）"
 >
 <Mail className="w-4 h-4" />
 QQ 邮箱一键填充
 </button>
 </div>

 <p className="text-xs text-muted-foreground mb-4">
 以 QQ 邮箱为例：用户名填完整邮箱地址，密码填
 <span className="text-foreground font-medium">授权码</span>
 （非 QQ 密码，在 QQ邮箱「设置 → 帐户 → POP3/SMTP 服务」中开启并生成）。
 </p>

 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div>
 <label className="block text-sm font-medium text-muted-foreground mb-2">SMTP 服务器</label>
 <input
 type="text"
 value={settings.smtpHost}
 onChange={(e) => setSettings({ ...settings, smtpHost: e.target.value })}
 placeholder="smtp.qq.com"
 className="input"
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-muted-foreground mb-2">SMTP 端口</label>
 <input
 type="number"
 value={settings.smtpPort}
 onChange={(e) => setSettings({ ...settings, smtpPort: parseInt(e.target.value) })}
 placeholder="465"
 className="input"
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-muted-foreground mb-2">SMTP 用户名（完整邮箱地址）</label>
 <input
 type="text"
 value={settings.smtpUser}
 onChange={(e) => setSettings({ ...settings, smtpUser: e.target.value })}
 placeholder="123456@qq.com"
 className="input"
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-muted-foreground mb-2">授权码</label>
 <input
 type="password"
 value={settings.smtpPassword}
 onChange={(e) => setSettings({ ...settings, smtpPassword: e.target.value })}
 placeholder="留空表示不修改已有授权码"
 className="input"
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-muted-foreground mb-2">发件人地址</label>
 <input
 type="email"
 value={settings.smtpFrom}
 onChange={(e) => setSettings({ ...settings, smtpFrom: e.target.value })}
 placeholder="与用户名一致的完整邮箱地址"
 className="input"
 />
 </div>

 <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
 <div>
 <p className="text-foreground font-medium">启用 SSL</p>
 <p className="text-sm text-muted-foreground">QQ 邮箱端口 465 需开启，端口 587 通常关闭</p>
 </div>
 <label className="relative inline-flex items-center cursor-pointer">
 <input
 type="checkbox"
 checked={settings.smtpSecure}
 onChange={(e) => setSettings({ ...settings, smtpSecure: e.target.checked })}
 className="sr-only peer"
 />
 <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
 </label>
 </div>
 </div>

 {/* 测试发信 */}
 <div className="mt-6 pt-6 border-t border-border">
 <h3 className="text-sm font-bold text-foreground mb-3">测试发信</h3>
 <p className="text-xs text-muted-foreground mb-3">
 保存设置后，可填入收件邮箱发送测试邮件，验证 SMTP 配置是否正确。
 </p>
 <div className="flex gap-3 flex-wrap">
 <input
 type="email"
 value={testEmail}
 onChange={(e) => setTestEmail(e.target.value)}
 placeholder="收件邮箱地址"
 className="input flex-1 min-w-[200px]"
 />
 <button
 onClick={handleTestEmail}
 disabled={testingEmail}
 className="btn btn-primary flex items-center gap-2"
 >
 {testingEmail ? (
 <>
 <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
 发送中...
 </>
 ) : (
 <>
 <Send className="w-4 h-4" />
 发送测试邮件
 </>
 )}
 </button>
 </div>
 {testResult && (
 <div className={`mt-3 px-4 py-3 rounded-lg text-sm ${
 testResult.type === 'success'
 ? 'bg-success/10 border border-success/30 text-success'
 : 'bg-error/10 border border-error/30 text-error'
 }`}>
 {testResult.msg}
 </div>
 )}
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
 )
}