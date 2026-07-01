'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import { fetchWithAuth } from '@/lib/api/base'
import { Shield, Save, Loader2, AlertCircle, CheckCircle, Lock } from 'lucide-react'
import type { RoleCode } from '@/lib/permissions/types'
import { unwrapApiList } from '@/lib/admin/apiData'

interface Permission {
 id: string
 code: string
 module: string
 name: string
 description: string | null
}

interface RoleData {
 role: RoleCode
 label: string
 rolePermissions: Array<{
 id: string
 permissionId: string
 permission: Permission
 }>
}

const ROLE_TABS: Array<{ role: RoleCode; label: string; color: string }> = [
 { role: 'SYSTEM_ADMIN', label: '系统管理员', color: 'tag-error' },
 { role: 'TEACHER', label: '教师', color: 'tag-warning' },
 { role: 'STUDENT', label: '学生', color: 'tag-info' },
]

const MODULE_LABELS: Record<string, string> = {
 user: '用户',
 class: '班级',
 problem: '题目',
 contest: '竞赛',
 training: '题单',
 post: '帖子',
 system: '系统',
}

export default function AdminRolesPage() {
 const router = useRouter()
 const [roles, setRoles] = useState<RoleData[]>([])
 const [allPermissions, setAllPermissions] = useState<Permission[]>([])
 const [loading, setLoading] = useState(true)
 const [saving, setSaving] = useState(false)
 const [error, setError] = useState('')
 const [success, setSuccess] = useState('')
 const [activeRole, setActiveRole] = useState<RoleCode>('SYSTEM_ADMIN')
 // 当前 tab 选中的 permissionId 集合
 const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

 useEffect(() => {
 fetchData()
 }, [])

 useEffect(() => {
 // tab 切换时，初始化勾选状态
 const roleData = roles.find(r => r.role === activeRole)
 if (roleData) {
 setSelectedIds(new Set(roleData.rolePermissions.map(rp => rp.permissionId)))
 }
 }, [activeRole, roles])

 const fetchData = async () => {
 try {
 setLoading(true)
 const [rolesRes, permsRes] = await Promise.all([
 fetchWithAuth('/api/admin/roles'),
 fetchWithAuth('/api/admin/permissions'),
 ])

 if (rolesRes.status === 403) {
 setError('需要管理员权限')
 setTimeout(() => router.push('/'), 2000)
 return
 }

 const rolesData = await rolesRes.json()
 const permsData = await permsRes.json()

 if (rolesData.success) {
 setRoles(unwrapApiList<RoleData>(rolesData))
 } else {
 setError(rolesData.error || '获取角色失败')
 }

 if (permsData.success) {
 setAllPermissions(unwrapApiList<Permission>(permsData))
 }
 } catch (err) {
 setError('网络错误')
 } finally {
 setLoading(false)
 }
 }

 const isSystemAdminTab = activeRole === 'SYSTEM_ADMIN'

 const togglePermission = (permId: string) => {
 if (isSystemAdminTab) return
 setSelectedIds(prev => {
 const next = new Set(prev)
 if (next.has(permId)) next.delete(permId)
 else next.add(permId)
 return next
 })
 }

 const toggleModule = (modulePerms: Permission[], allSelected: boolean) => {
 if (isSystemAdminTab) return
 setSelectedIds(prev => {
 const next = new Set(prev)
 if (allSelected) {
 for (const p of modulePerms) next.delete(p.id)
 } else {
 for (const p of modulePerms) next.add(p.id)
 }
 return next
 })
 }

 const isLocked = (_perm: Permission): boolean => isSystemAdminTab

 const handleSave = async () => {
 if (isSystemAdminTab) {
 setError('系统管理员默认拥有全部权限，请切换到「教师」或「学生」进行配置')
 return
 }
 setSaving(true)
 setError('')
 setSuccess('')

 try {
 const response = await fetchWithAuth('/api/admin/roles', {
 method: 'PUT',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 role: activeRole,
 permissionIds: Array.from(selectedIds),
 }),
 })

 const data = await response.json()
 if (data.success) {
 setSuccess('角色权限已保存')
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

 const groupedPerms = useMemo(() => {
 const map = new Map<string, Permission[]>()
 for (const p of allPermissions) {
 const list = map.get(p.module) || []
 list.push(p)
 map.set(p.module, list)
 }
 return Array.from(map.entries())
 }, [allPermissions])

 const totalSelected = selectedIds.size
 const totalAll = allPermissions.length

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
 <Shield className="w-5 h-5 text-white" />
 </div>
 <div>
 <h1 className="text-2xl font-bold text-foreground">角色权限</h1>
 <p className="text-sm text-muted-foreground">配置系统角色默认拥有的权限点</p>
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

 <div className="card overflow-hidden">
 <div className="flex border-b border-slate-200">
 {ROLE_TABS.map(tab => (
 <button
 key={tab.role}
 onClick={() => setActiveRole(tab.role)}
 className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
 activeRole === tab.role
 ? 'text-primary border-primary'
 : 'text-muted-foreground border-transparent hover:text-foreground'
 }`}
 >
 {tab.label}
 </button>
 ))}
 </div>

 <div className="p-5">
 {isSystemAdminTab && (
 <div className="mb-4 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-800 dark:text-amber-200 flex items-center gap-2">
 <Lock className="w-4 h-4 shrink-0" />
 系统管理员在运行时拥有全部权限点，此处为只读展示。请切换到「教师」或「学生」标签自由勾选并保存。
 </div>
 )}
 <div className="flex items-center justify-between mb-4">
 <p className="text-sm text-muted-foreground">
 已选 <span className="text-foreground font-medium">{totalSelected}</span> / {totalAll} 个权限点
 </p>
 </div>

 <div className="space-y-4">
 {groupedPerms.map(([module, perms]) => {
 const allSelected = perms.every(p => selectedIds.has(p.id))
 const someSelected = perms.some(p => selectedIds.has(p.id))
 return (
 <div key={module} className="border border-border rounded-lg">
 <div className="flex items-center justify-between p-3 bg-muted">
 <div className="flex items-center gap-2">
 <input
 type="checkbox"
 checked={allSelected}
 ref={(el) => {
 if (el) el.indeterminate = !allSelected && someSelected
 }}
 onChange={() => toggleModule(perms, allSelected)}
 className="w-4 h-4 rounded border-border bg-muted text-primary focus:ring-primary"
 />
 <span className="text-sm font-medium text-foreground">
 {MODULE_LABELS[module] || module}
 </span>
 <span className="text-xs text-muted-foreground">
 {perms.filter(p => selectedIds.has(p.id)).length} / {perms.length}
 </span>
 </div>
 </div>
 <div className="divide-y divide-slate-100">
 {perms.map(p => {
 const locked = isLocked(p)
 return (
 <label
 key={p.id}
 className={`flex items-start gap-3 p-3 hover:bg-muted transition-colors ${
 locked ? 'opacity-80 cursor-not-allowed' : 'cursor-pointer'
 }`}
 >
 <input
 type="checkbox"
 checked={selectedIds.has(p.id)}
 disabled={locked}
 onChange={() => !locked && togglePermission(p.id)}
 className="mt-1 w-4 h-4 rounded border-border bg-muted text-primary focus:ring-primary disabled:opacity-50"
 />
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 flex-wrap">
 <span className="text-foreground font-medium">{p.name}</span>
 <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">
 {p.code}
 </code>
 {locked && (
 <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 flex items-center gap-1">
 <Lock className="w-3 h-3" />
 强制开启
 </span>
 )}
 </div>
 {p.description && (
 <p className="text-xs text-muted-foreground mt-1">{p.description}</p>
 )}
 </div>
 </label>
 )
 })}
 </div>
 </div>
 )
 })}
 </div>
 </div>
 </div>

 <div className="flex justify-end">
 <button
 onClick={handleSave}
 disabled={saving || isSystemAdminTab}
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
