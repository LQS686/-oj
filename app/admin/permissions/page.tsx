'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import { fetchWithAuth } from '@/lib/api/base'
import { KeyRound, Search, ShieldCheck } from 'lucide-react'
import { unwrapApiList } from '@/lib/admin/apiData'

interface Permission {
 id: string
 code: string
 module: string
 name: string
 description: string | null
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

export default function AdminPermissionsPage() {
 const router = useRouter()
 const [permissions, setPermissions] = useState<Permission[]>([])
 const [loading, setLoading] = useState(true)
 const [error, setError] = useState('')
 const [searchQuery, setSearchQuery] = useState('')

 useEffect(() => {
 fetchPermissions()
 }, [])

 const fetchPermissions = async () => {
 try {
 setLoading(true)
 const response = await fetchWithAuth('/api/admin/permissions')

 if (response.status === 403) {
 setError('需要管理员权限')
 setTimeout(() => router.push('/'), 2000)
 return
 }

 const data = await response.json()
 if (data.success) {
 setPermissions(unwrapApiList<Permission>(data))
 } else {
 setError(data.error || '获取权限点失败')
 }
 } catch (err) {
 setError('网络错误')
 } finally {
 setLoading(false)
 }
 }

 const filtered = useMemo(() => {
 const q = searchQuery.trim().toLowerCase()
 if (!q) return permissions
 return permissions.filter(p =>
 p.code.toLowerCase().includes(q) ||
 p.name.toLowerCase().includes(q)
 )
 }, [permissions, searchQuery])

 const grouped = useMemo(() => {
 const map = new Map<string, Permission[]>()
 for (const p of filtered) {
 const list = map.get(p.module) || []
 list.push(p)
 map.set(p.module, list)
 }
 return Array.from(map.entries())
 }, [filtered])

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
 <KeyRound className="w-5 h-5 text-white" />
 </div>
 <div>
 <h1 className="text-2xl font-bold text-foreground">权限点</h1>
 <p className="text-sm text-muted-foreground">系统内全部原子权限点（{permissions.length} 个）</p>
 </div>
 </div>

 {error && !error.includes('权限') && (
 <div className="bg-error/10 border border-error/30 text-error px-4 py-3 rounded-lg">
 {error}
 </div>
 )}

 <div className="card p-4">
 <div className="relative">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
 <input
 type="text"
 placeholder="搜索 code 或名称..."
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 className="input pl-10"
 />
 </div>
 </div>

 {grouped.length === 0 ? (
 <div className="card p-12 text-center text-muted-foreground">
 {searchQuery ? '没有匹配的权限点' : '暂无权限点，请先运行 seed-permissions'}
 </div>
 ) : (
 <div className="space-y-4">
 {grouped.map(([module, items]) => (
 <div key={module} className="card p-5">
 <div className="flex items-center gap-2 mb-4">
 <ShieldCheck className="w-4 h-4 text-primary" />
 <h2 className="text-base font-bold text-foreground">
 {MODULE_LABELS[module] || module}
 </h2>
 <span className="text-xs text-muted-foreground">（{items.length} 个）</span>
 </div>
 <div className="divide-y divide-slate-100">
 {items.map(p => (
 <div key={p.id} className="py-3 first:pt-0 last:pb-0 flex items-start gap-4">
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 flex-wrap">
 <span className="text-foreground font-medium">{p.name}</span>
 <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">
 {p.code}
 </code>
 </div>
 {p.description && (
 <p className="text-sm text-muted-foreground mt-1">{p.description}</p>
 )}
 </div>
 </div>
 ))}
 </div>
 </div>
 ))}
 </div>
 )}
 </div>
 </AdminLayout>
 )
}
