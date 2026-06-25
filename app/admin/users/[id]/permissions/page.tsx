'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import { fetchWithAuth } from '@/lib/api/base'
import { UserCog, Save, Loader2, AlertCircle, CheckCircle, ShieldCheck, ShieldX, ArrowLeft } from 'lucide-react'

interface Permission {
 id: string
 code: string
 module: string
 name: string
 description: string | null
}

interface UserPermission {
 id: string
 permissionCode: string
 value: boolean
}

interface UserInfo {
 id: string
 username: string
 role: string
 isSuperAdmin: boolean
}

const ROLE_LABELS: Record<string, string> = {
 SYSTEM_ADMIN: '系统管理员',
 TEACHER: '教师',
 STUDENT: '学生',
}

const ROLE_COLORS: Record<string, string> = {
 SYSTEM_ADMIN: 'tag-error',
 TEACHER: 'tag-warning',
 STUDENT: 'tag-info',
}

const MODULE_LABELS: Record<string, string> = {
 user: '用户',
 class: '班级',
 problem: '题目',
 contest: '竞赛',
 training: '题单',
 post: '帖子',
 system: '系统',
}

// 三态：'inherit' = 不覆盖（跟随角色）；'grant' = 显式授予；'deny' = 显式拒绝
type OverrideValue = 'inherit' | 'grant' | 'deny'

export default function AdminUserPermissionsPage() {
 const params = useParams<{ id: string }>()
 const router = useRouter()
 const userId = params?.id as string

 const [user, setUser] = useState<UserInfo | null>(null)
 const [rolePermissions, setRolePermissions] = useState<Permission[]>([])
 const [userPermissions, setUserPermissions] = useState<UserPermission[]>([])
 const [allPermissions, setAllPermissions] = useState<Permission[]>([])
 const [overrides, setOverrides] = useState<Record<string, OverrideValue>>({})
 const [loading, setLoading] = useState(true)
 const [saving, setSaving] = useState(false)
 const [error, setError] = useState('')
 const [success, setSuccess] = useState('')

 useEffect(() => {
 if (userId) {
 fetchData()
 }
 }, [userId])

 const fetchData = async () => {
 try {
 setLoading(true)
 const [detailRes, permsRes] = await Promise.all([
 fetchWithAuth(`/api/admin/users/${userId}/permissions`),
 fetchWithAuth('/api/admin/permissions'),
 ])

 if (detailRes.status === 403) {
 setError('需要管理员权限')
 setTimeout(() => router.push('/'), 2000)
 return
 }

 const detailData = await detailRes.json()
 const permsData = await permsRes.json()

 if (detailData.success) {
 const d = detailData.data
 setUser(d.user)
 setRolePermissions(d.rolePermissions || [])
 setUserPermissions(d.userPermissions || [])

 // 初始化 overrides：把 userPermission 映射成 map
 const map: Record<string, OverrideValue> = {}
 for (const up of (d.userPermissions || [])) {
 map[up.permissionCode] = up.value ? 'grant' : 'deny'
 }
 setOverrides(map)
 } else {
 setError(detailData.error || '加载失败')
 }

 if (permsData.success) {
 const list = Array.isArray(permsData.data?.data)
 ? permsData.data.data
 : Array.isArray(permsData.data)
 ? permsData.data
 : []
 setAllPermissions(list)
 }
 } catch (err) {
 setError('网络错误')
 } finally {
 setLoading(false)
 }
 }

 const setOverride = (code: string, value: OverrideValue) => {
 setOverrides(prev => ({ ...prev, [code]: value }))
 }

 const roleCodeSet = useMemo(
 () => new Set(rolePermissions.map(p => p.code)),
 [rolePermissions]
 )

 // 用于「用户级覆盖」section：列出所有权限点（不管角色默认有没有）
 // 该 section 展示那些有 override 的 + 没 override 的（可选），方便用户改
 const groupedAll = useMemo(() => {
 const map = new Map<string, Permission[]>()
 for (const p of allPermissions) {
 const list = map.get(p.module) || []
 list.push(p)
 map.set(p.module, list)
 }
 return Array.from(map.entries())
 }, [allPermissions])

 const groupedRole = useMemo(() => {
 const map = new Map<string, Permission[]>()
 for (const p of rolePermissions) {
 const list = map.get(p.module) || []
 list.push(p)
 map.set(p.module, list)
 }
 return Array.from(map.entries())
 }, [rolePermissions])

 // 统计 overrides
 const overrideCount = useMemo(() => {
 let grant = 0
 let deny = 0
 for (const v of Object.values(overrides)) {
 if (v === 'grant') grant++
 else if (v === 'deny') deny++
 }
 return { grant, deny }
 }, [overrides])

 const handleSave = async () => {
 setSaving(true)
 setError('')
 setSuccess('')

 // 收集非 inherit 的覆盖
 const permissions = Object.entries(overrides)
 .filter(([_, v]) => v === 'grant' || v === 'deny')
 .map(([permissionCode, value]) => ({
 permissionCode,
 value: value === 'grant',
 }))

 try {
 const response = await fetchWithAuth(`/api/admin/users/${userId}/permissions`, {
 method: 'PUT',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ permissions }),
 })

 const data = await response.json()
 if (data.success) {
 setSuccess('用户权限已保存')
 setTimeout(() => setSuccess(''), 3000)
 await fetchData()
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
 <button
 onClick={() => router.push('/admin/users')}
 className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
 title="返回用户列表"
 >
 <ArrowLeft className="w-5 h-5" />
 </button>
 <div className="w-10 h-10 rounded-xl flex items-center justify-center"
 style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)' }}>
 <UserCog className="w-5 h-5 text-white" />
 </div>
 <div className="flex-1">
 <h1 className="text-2xl font-bold text-foreground">
 用户权限：{user?.username || '加载中'}
 </h1>
 <p className="text-sm text-muted-foreground">配置该用户的用户级权限覆盖</p>
 </div>
 </div>

 {error && !error.includes('权限') && (
 <div className="bg-error/10 border border-error/30 text-error px-4 py-3 rounded-lg flex items-center gap-2">
 <AlertCircle className="w-4 h-4" />
 {error}
 </div>
 )}

 {success && (
 <div className="bg-secondary/10 border border-secondary/30 text-secondary px-4 py-3 rounded-lg flex items-center gap-2">
 <CheckCircle className="w-4 h-4" />
 {success}
 </div>
 )}

 {/* Section 1: 基础信息 */}
 {user && (
 <div className="card p-5">
 <h2 className="text-base font-bold text-foreground mb-3">基础信息</h2>
 <div className="flex flex-wrap items-center gap-4">
 <div>
 <span className="text-sm text-muted-foreground mr-2">系统角色：</span>
 <span className={`tag ${ROLE_COLORS[user.role] || 'tag-info'}`}>
 {ROLE_LABELS[user.role] || user.role}
 </span>
 </div>
 <div>
 <span className="text-sm text-muted-foreground mr-2">超级管理员：</span>
 {user.isSuperAdmin ? (
 <span className="tag tag-error">是</span>
 ) : (
 <span className="tag tag-info">否</span>
 )}
 </div>
 </div>
 </div>
 )}

 {/* Section 2: 继承自角色（只读） */}
 <div className="card p-5">
 <div className="flex items-center gap-2 mb-3">
 <ShieldCheck className="w-4 h-4 text-secondary" />
 <h2 className="text-base font-bold text-foreground">继承自角色</h2>
 <span className="text-xs text-muted-foreground">（只读，{rolePermissions.length} 个）</span>
 </div>
 {groupedRole.length === 0 ? (
 <p className="text-sm text-muted-foreground py-2">该角色没有默认权限</p>
 ) : (
 <div className="space-y-3">
 {groupedRole.map(([module, perms]) => (
 <div key={module}>
 <div className="text-xs font-medium text-muted-foreground mb-1.5">
 {MODULE_LABELS[module] || module}
 </div>
 <div className="flex flex-wrap gap-1.5">
 {perms.map(p => (
 <span key={p.id} className="tag tag-success inline-flex items-center gap-1">
 {p.name}
 <code className="font-mono text-[10px] opacity-70">{p.code}</code>
 </span>
 ))}
 </div>
 </div>
 ))}
 </div>
 )}
 </div>

 {/* Section 3: 用户级覆盖 */}
 <div className="card p-5">
 <div className="flex items-center justify-between mb-3">
 <div className="flex items-center gap-2">
 <ShieldX className="w-4 h-4 text-accent" />
 <h2 className="text-base font-bold text-foreground">用户级覆盖</h2>
 <span className="text-xs text-muted-foreground">
 （授予 {overrideCount.grant} / 拒绝 {overrideCount.deny}）
 </span>
 </div>
 <p className="text-xs text-muted-foreground hidden md:block">
 三个值：跟随角色（默认）/ 显式授予 / 显式拒绝
 </p>
 </div>

 {groupedAll.length === 0 ? (
 <p className="text-sm text-muted-foreground py-2">暂无权限点数据</p>
 ) : (
 <div className="space-y-3">
 {groupedAll.map(([module, perms]) => (
 <div key={module} className="border border-border rounded-lg">
 <div className="px-3 py-2 bg-muted text-xs font-medium text-foreground">
 {MODULE_LABELS[module] || module}
 </div>
 <div className="divide-y divide-slate-100">
 {perms.map(p => {
 const fromRole = roleCodeSet.has(p.code)
 const override = overrides[p.code] || 'inherit'
 return (
 <div key={p.id} className="flex items-center gap-3 p-3 flex-wrap">
 <div className="flex-1 min-w-[240px]">
 <div className="flex items-center gap-2 flex-wrap">
 <span className="text-foreground font-medium text-sm">{p.name}</span>
 <code className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
 {p.code}
 </code>
 {fromRole && (
 <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary/10 text-secondary">
 来自角色
 </span>
 )}
 </div>
 {p.description && (
 <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
 )}
 </div>
 <div className="flex items-center gap-1.5 text-xs">
 <button
 onClick={() => setOverride(p.code, 'inherit')}
 className={`px-2.5 py-1 rounded border transition-colors ${
 override === 'inherit'
 ? 'bg-muted text-foreground border-border'
 : 'bg-transparent text-muted-foreground border-border hover:bg-muted'
 }`}
 >
 跟随角色
 </button>
 <button
 onClick={() => setOverride(p.code, 'grant')}
 className={`px-2.5 py-1 rounded border transition-colors ${
 override === 'grant'
 ? 'bg-secondary/20 text-secondary border-secondary/40'
 : 'bg-transparent text-muted-foreground border-border hover:bg-secondary/10'
 }`}
 >
 授予
 </button>
 <button
 onClick={() => setOverride(p.code, 'deny')}
 className={`px-2.5 py-1 rounded border transition-colors ${
 override === 'deny'
 ? 'bg-error/20 text-error border-error/40'
 : 'bg-transparent text-muted-foreground border-border hover:bg-error/10'
 }`}
 >
 拒绝
 </button>
 </div>
 </div>
 )
 })}
 </div>
 </div>
 ))}
 </div>
 )}
 </div>

 <div className="flex justify-end">
 <button
 onClick={handleSave}
 disabled={saving}
 className="btn btn-primary flex items-center gap-2"
 >
 {saving ? (
 <>
 <Loader2 className="w-4 h-4 animate-spin" />
 保存中...
 </>
 ) : (
 <>
 <Save className="w-4 h-4" />
 保存
 </>
 )}
 </button>
 </div>
 </div>
 </AdminLayout>
 )
}
