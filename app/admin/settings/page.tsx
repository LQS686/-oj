'use client'

import { useState, useCallback } from 'react'
import { useDeferredEffect } from '@/hooks/useDeferredEffect'
import { useForbiddenRedirect } from '@/hooks/useForbiddenRedirect'
import { fetchWithCookie } from '@/lib/api/base'
import { AdminPageShell } from '@/components/admin'
import { Save, Mail, Shield, Globe, Send, Cpu, ChevronDown, ChevronUp } from 'lucide-react'
import {
  defaultSettings,
  defaultJudgeSettings,
  type SystemSettings,
  type JudgeSettings,
  type FailFastMode,
} from '@/lib/settings-defaults'
import { useSettings } from '@/contexts/SettingsContext'

function numOr(v: string, fallback: number): number {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : fallback
}

export default function AdminSettingsPage() {
 const scheduleForbiddenRedirect = useForbiddenRedirect()
 const { refreshSettings } = useSettings()
 const [loading, setLoading] = useState(true)
 const [saving, setSaving] = useState(false)
 const [error, setError] = useState('')
 const [success, setSuccess] = useState('')
 const [settings, setSettings] = useState<SystemSettings>({
   ...defaultSettings,
   judge: { ...defaultJudgeSettings },
 })
 const [showJudgeAdvanced, setShowJudgeAdvanced] = useState(false)
 const [testEmail, setTestEmail] = useState('')
 const [testingEmail, setTestingEmail] = useState(false)
 const [testResult, setTestResult] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

 const updateJudge = <K extends keyof JudgeSettings>(key: K, value: JudgeSettings[K]) => {
   setSettings((prev) => ({
     ...prev,
     judge: { ...(prev.judge ?? defaultJudgeSettings), [key]: value },
   }))
 }

 const judge: JudgeSettings = settings.judge ?? defaultJudgeSettings

 const fetchSettings = useCallback(async () => {
 try {
 const response = await fetchWithCookie('/api/admin/settings')

 if (response.status === 403) {
 setError('需要系统管理员权限')
 scheduleForbiddenRedirect()
 return
 }

 const data = await response.json()
 if (data.success && data.data) {
 setSettings((prev) => ({
   ...prev,
   ...data.data,
   judge: { ...defaultJudgeSettings, ...(data.data.judge || {}) },
 }))
 }
 } catch {
 setError('网络错误')
 } finally {
 setLoading(false)
 }
 }, [scheduleForbiddenRedirect])

 useDeferredEffect(() => {
 void fetchSettings()
 }, [fetchSettings])

 const handleSave = async () => {
 setSaving(true)
 setError('')
 setSuccess('')

 try {
 const response = await fetchWithCookie('/api/admin/settings', {
 method: 'PUT',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(settings)
 })

 const data = await response.json()
 if (data.success) {
 setSuccess('设置已保存（评测配置已热更新）')
 if (data.data) {
   setSettings((prev) => ({
     ...prev,
     ...data.data,
     judge: { ...defaultJudgeSettings, ...(data.data.judge || {}) },
   }))
 }
 // 同步公开设置上下文，使导航栏/注册页立即反映「允许注册」等开关
 void refreshSettings()
 setTimeout(() => setSuccess(''), 3000)
 } else {
 setError(data.error || data.message || '保存失败')
 }
 } catch {
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
 const response = await fetchWithCookie('/api/admin/settings/test-email', {
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
 } catch {
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
 <AdminPageShell width="wide" className="space-y-6">
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
 value={['cpp', 'c', 'python'].includes(settings.defaultLanguage) ? settings.defaultLanguage : 'cpp'}
 onChange={(e) => setSettings({ ...settings, defaultLanguage: e.target.value })}
 className="input"
 >
 <option value="cpp">C++</option>
 <option value="c">C</option>
 <option value="python">Python</option>
 </select>
 <p className="mt-1.5 text-xs text-muted-foreground">与当前评测支持的语言一致</p>
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
 <p className="text-sm text-muted-foreground">预留开关（当前提交接口仍需登录）</p>
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
 min={1}
 max={512}
 value={Math.max(1, Math.round((settings.maxSubmissionSize || 65536) / 1024))}
 onChange={(e) => {
   const kb = parseInt(e.target.value, 10)
   if (!Number.isFinite(kb)) return
   setSettings({
     ...settings,
     maxSubmissionSize: Math.min(512 * 1024, Math.max(1024, kb * 1024)),
   })
 }}
 className="input"
 />
 <p className="mt-1.5 text-xs text-muted-foreground">范围 1–512 KB（存库为字节）</p>
 </div>
 </div>
 </div>

 <div className="card p-6 lg:col-span-2">
 <div className="flex items-center gap-3 mb-2">
 <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary/15">
 <Cpu className="w-4 h-4 text-primary-light" />
 </div>
 <h2 className="text-lg font-bold text-foreground">评测设置</h2>
 </div>
 <p className="text-xs text-muted-foreground mb-6">
 保存后立即热更新当前进程的评测队列。若 .env / Docker 中显式设置了同名 JUDGE_* 环境变量，环境变量优先。
 </p>

 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
 <div>
 <label className="block text-sm font-medium text-muted-foreground mb-2">单任务超时（秒）</label>
 <input
 type="number"
 min={30}
 max={3600}
 value={judge.jobTimeout}
 onChange={(e) => updateJudge('jobTimeout', Math.round(numOr(e.target.value, judge.jobTimeout)))}
 className="input"
 />
 <p className="text-xs text-muted-foreground mt-1">超时后中止选手进程并标 SE</p>
 </div>

 <div>
 <label className="block text-sm font-medium text-muted-foreground mb-2">Fail-fast</label>
 <select
 value={judge.failFast}
 onChange={(e) => updateJudge('failFast', e.target.value as FailFastMode)}
 className="input"
 >
 <option value="off">off — 跑完全部测点（OI）</option>
 <option value="hard">hard — TLE/MLE/RE 等后中止</option>
 <option value="all">all — 任意非 AC 即停（ACM）</option>
 </select>
 </div>

 <div>
 <label className="block text-sm font-medium text-muted-foreground mb-2">跨提交并发</label>
 <input
 type="number"
 min={1}
 max={16}
 value={judge.maxConcurrent}
 onChange={(e) => updateJudge('maxConcurrent', Math.round(numOr(e.target.value, judge.maxConcurrent)))}
 className="input"
 />
 <p className="text-xs text-muted-foreground mt-1">同时评测的提交数；计时敏感建议 1</p>
 </div>

 <div>
 <label className="block text-sm font-medium text-muted-foreground mb-2">测点并行度</label>
 <input
 type="number"
 min={0}
 max={16}
 value={judge.caseConcurrency}
 onChange={(e) => updateJudge('caseConcurrency', Math.round(numOr(e.target.value, judge.caseConcurrency)))}
 className="input"
 />
 <p className="text-xs text-muted-foreground mt-1">0 = 按 CPU 自动（约 4–8）</p>
 </div>

 <div>
 <label className="block text-sm font-medium text-muted-foreground mb-2">大测点并行度</label>
 <input
 type="number"
 min={1}
 max={8}
 value={judge.largeCaseConcurrency}
 onChange={(e) => updateJudge('largeCaseConcurrency', Math.round(numOr(e.target.value, judge.largeCaseConcurrency)))}
 className="input"
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-muted-foreground mb-2">临界 TLE 重测次数</label>
 <input
 type="number"
 min={0}
 max={5}
 value={judge.rejudgeTimes}
 onChange={(e) => updateJudge('rejudgeTimes', Math.round(numOr(e.target.value, judge.rejudgeTimes)))}
 className="input"
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-muted-foreground mb-2">超时容差比例</label>
 <input
 type="number"
 min={0}
 max={1}
 step={0.05}
 value={judge.extraTimeRatio}
 onChange={(e) => updateJudge('extraTimeRatio', numOr(e.target.value, judge.extraTimeRatio))}
 className="input"
 />
 <p className="text-xs text-muted-foreground mt-1">如 0.1 = 10% 浮动窗口</p>
 </div>

 <div>
 <label className="block text-sm font-medium text-muted-foreground mb-2">编译超时（毫秒）</label>
 <input
 type="number"
 min={5000}
 max={120000}
 step={1000}
 value={judge.compileTimeout}
 onChange={(e) => updateJudge('compileTimeout', Math.round(numOr(e.target.value, judge.compileTimeout)))}
 className="input"
 />
 </div>
 </div>

 <button
 type="button"
 onClick={() => setShowJudgeAdvanced((v) => !v)}
 className="mt-5 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
 >
 {showJudgeAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
 高级选项
 </button>

 {showJudgeAdvanced && (
 <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 rounded-lg bg-white/5">
 <div>
 <label className="block text-sm font-medium text-muted-foreground mb-2">I/O 墙钟裕量上限（ms）</label>
 <input
 type="number"
 min={5000}
 max={120000}
 step={1000}
 value={judge.ioSlackMaxMs}
 onChange={(e) => updateJudge('ioSlackMaxMs', Math.round(numOr(e.target.value, judge.ioSlackMaxMs)))}
 className="input"
 />
 <p className="text-xs text-muted-foreground mt-1">大输出题墙钟上限，过大易卡「评测中」</p>
 </div>
 <div>
 <label className="block text-sm font-medium text-muted-foreground mb-2">死任务扫描间隔（ms）</label>
 <input
 type="number"
 min={2000}
 max={30000}
 step={500}
 value={judge.deadCheckMs}
 onChange={(e) => updateJudge('deadCheckMs', Math.round(numOr(e.target.value, judge.deadCheckMs)))}
 className="input"
 />
 </div>
 <div>
 <label className="block text-sm font-medium text-muted-foreground mb-2">close 兜底等待（ms）</label>
 <input
 type="number"
 min={200}
 max={2000}
 step={50}
 value={judge.closeFallbackMs}
 onChange={(e) => updateJudge('closeFallbackMs', Math.round(numOr(e.target.value, judge.closeFallbackMs)))}
 className="input"
 />
 </div>
 <div>
 <label className="block text-sm font-medium text-muted-foreground mb-2">大测点字节阈值</label>
 <input
 type="number"
 min={262144}
 max={67108864}
 step={1048576}
 value={judge.largeCaseBytes}
 onChange={(e) => updateJudge('largeCaseBytes', Math.round(numOr(e.target.value, judge.largeCaseBytes)))}
 className="input"
 />
 <p className="text-xs text-muted-foreground mt-1">默认 2097152（2 MiB）</p>
 </div>
 </div>
 )}
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
 </AdminPageShell>
 )
}