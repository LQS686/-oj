'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { DataTable, type Column } from '@/components/admin'
import { fetchWithAuth } from '@/lib/api/base'
import { useUser } from '@/contexts/UserContext'
import { isSystemAdmin } from '@/lib/permissions'
import { Users, Search, Shield, User, Mail, Calendar, MoreHorizontal, Edit, Trash2, ShieldCheck, ShieldOff, UserPlus, Upload, X, Plus, CheckSquare, Square, FileText, AlertCircle, CheckCircle, Loader2, Download, KeyRound, TrendingUp } from 'lucide-react'
import { formatDate } from '@/lib/utils'

/**
 * 本地角色展示映射（四级角色体系：SYSTEM_ADMIN / ADMIN / TEACHER / STUDENT）
 * 与 lib/permissions.ts 的旧 API 保持独立，避免污染权限系统实现。
 */
const ROLE_DISPLAY: Record<string, { label: string; color: string }> = {
 SYSTEM_ADMIN: { label: '系统管理员', color: 'tag-error' },
 ADMIN: { label: '管理员', color: 'tag-error' },
 TEACHER: { label: '教师', color: 'tag-warning' },
 STUDENT: { label: '学生', color: 'tag-info' },
}

function getRoleDisplay(role?: string) {
 if (role === 'SYSTEM_ADMIN') return ROLE_DISPLAY.SYSTEM_ADMIN
 if (role === 'ADMIN') return ROLE_DISPLAY.ADMIN
 if (role === 'TEACHER') return ROLE_DISPLAY.TEACHER
 if (role === 'STUDENT') return ROLE_DISPLAY.STUDENT
 return ROLE_DISPLAY.STUDENT
}

/**
 * 角色展示顺序（用于统计卡的角色分布横向条形）。
 * 与 lib/permissions.ts 的旧 API 保持独立，避免污染权限系统实现。
 */
const ROLE_ORDER: string[] = ['SYSTEM_ADMIN', 'ADMIN', 'TEACHER', 'STUDENT']

const ROLE_BAR_COLOR: Record<string, string> = {
 SYSTEM_ADMIN: 'bg-error',
 ADMIN: 'bg-error',
 TEACHER: 'bg-warning',
 STUDENT: 'bg-info',
}

/**
 * 计算最近 7 天内新增的用户数（本周增长）。
 * 复用现有 users 数据，不引入新数据源。
 */
function getWeeklyGrowth(users: User[]): number {
 const now = Date.now()
 const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
 return users.filter(u => {
 const created = new Date(u.createdAt).getTime()
 return !isNaN(created) && now - created <= sevenDaysMs
 }).length
}

interface User {
 id: string
 username: string
 email: string
 role: string
 createdAt: string
 _count?: {
 submissions: number
 problems: number
 }
}

interface BatchUser {
 username: string
 email?: string
 password: string
 role: string
}

interface BatchResult {
 success: boolean
 message: string
 user?: {
 username: string
 email: string
 }
}

export default function AdminUsersPage() {
 const router = useRouter()
 const { user: currentUser } = useUser()
 // 当前操作者是否为系统管理员（系统管理员可赋予 ADMIN/TEACHER/STUDENT；管理员只能赋予 TEACHER/STUDENT）
 const operatorIsSystemAdmin = isSystemAdmin(currentUser)
 const [users, setUsers] = useState<User[]>([])
 const [loading, setLoading] = useState(true)
 const [error, setError] = useState('')
 const [searchQuery, setSearchQuery] = useState('')
 const [roleFilter, setRoleFilter] = useState('all')
 const [selectedUser, setSelectedUser] = useState<User | null>(null)
 const [showEditModal, setShowEditModal] = useState(false)
 const [showDeleteModal, setShowDeleteModal] = useState(false)
 const [editRole, setEditRole] = useState('')
 // 重置密码（独立操作，仅 SYSTEM_ADMIN 可用）
 const [resetTarget, setResetTarget] = useState<User | null>(null)
 const [resetPassword, setResetPassword] = useState('')
 const [resetting, setResetting] = useState(false)
 
 const [showBatchRegisterModal, setShowBatchRegisterModal] = useState(false)
 const [batchUsers, setBatchUsers] = useState<BatchUser[]>([
 { username: '', password: '', role: 'STUDENT' }
 ])
 const [batchRegistering, setBatchRegistering] = useState(false)
 const [batchResults, setBatchResults] = useState<BatchResult[]>([])
 const [useUnifiedPassword, setUseUnifiedPassword] = useState(false)
 const [unifiedPassword, setUnifiedPassword] = useState('')
 const [activeTab, setActiveTab] = useState<'form' | 'csv'>('form')
 
 const [csvFile, setCsvFile] = useState<File | null>(null)
 const [csvUploading, setCsvUploading] = useState(false)
 const [csvUploadProgress, setCsvUploadProgress] = useState(0)
 const [csvResults, setCsvResults] = useState<BatchResult[]>([])
 const [isDragging, setIsDragging] = useState(false)
 const fileInputRef = useRef<HTMLInputElement>(null)
 
 const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set())
 const [showBatchEditModal, setShowBatchEditModal] = useState(false)
 const [showBatchDeleteModal, setShowBatchDeleteModal] = useState(false)
 const [batchEditRole, setBatchEditRole] = useState('STUDENT')
 const [batchOperating, setBatchOperating] = useState(false)
 const [tableKey, setTableKey] = useState(0)

 useEffect(() => {
 fetchUsers()
 }, [])

 const fetchUsers = async () => {
 try {
 setLoading(true)
 const response = await fetchWithAuth('/api/admin/users')

 if (response.status === 403) {
 setError('需要管理员权限')
 setTimeout(() => router.push('/403'), 2000)
 return
 }

 const data = await response.json()
 if (data.success) {
   const payload = data.data
   setUsers(Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [])
 } else {
 setError(data.error || '获取用户列表失败')
 setUsers([])
 }
 } catch (err) {
 setError('网络错误')
 } finally {
 setLoading(false)
 }
 }

 const handleEditUser = async () => {
 if (!selectedUser) return

 try {
 const response = await fetchWithAuth(`/api/admin/users/${selectedUser.id}`, {
 method: 'PATCH',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ role: editRole })
 })

 const data = await response.json()
 if (data.success) {
 setShowEditModal(false)
 setSelectedUser(null)
 fetchUsers()
 } else {
 alert(data.error || '更新失败')
 }
 } catch (err) {
 alert('网络错误')
 }
 }

 const handleResetPassword = async () => {
 if (!resetTarget) return

 if (!resetPassword) {
 alert('请输入新密码')
 return
 }
 if (resetPassword.length < 6) {
 alert('密码长度至少为6位')
 return
 }

 setResetting(true)
 try {
 const response = await fetchWithAuth(`/api/admin/users/${resetTarget.id}`, {
 method: 'PATCH',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ password: resetPassword })
 })

 const data = await response.json()
 if (data.success) {
 setResetTarget(null)
 setResetPassword('')
 } else {
 alert(data.error || '重置失败')
 }
 } catch (err) {
 alert('网络错误')
 } finally {
 setResetting(false)
 }
 }

 const handleDeleteUser = async () => {
 if (!selectedUser) return

 try {
 const response = await fetchWithAuth(`/api/admin/users/${selectedUser.id}`, {
 method: 'DELETE'
 })

 const data = await response.json()
 if (data.success) {
 setShowDeleteModal(false)
 setSelectedUser(null)
 fetchUsers()
 } else {
 alert(data.error || '删除失败')
 }
 } catch (err) {
 alert('网络错误')
 }
 }

 const getUserRole = (user: User): string => {
 return user.role
 }

 const filteredUsers = users.filter(user => {
 const actualRole = getUserRole(user)
 const matchesSearch = user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
 user.email.toLowerCase().includes(searchQuery.toLowerCase())
 const matchesRole = roleFilter === 'all' || actualRole === roleFilter
 return matchesSearch && matchesRole
 })

 const addBatchUser = () => {
 setBatchUsers([...batchUsers, { username: '', password: '', role: 'STUDENT' }])
 }

 const removeBatchUser = (index: number) => {
 if (batchUsers.length > 1) {
 setBatchUsers(batchUsers.filter((_, i) => i !== index))
 }
 }

 const updateBatchUser = (index: number, field: keyof BatchUser, value: string) => {
 const updated = [...batchUsers]
 updated[index][field] = value
 setBatchUsers(updated)
 }

 const handleBatchRegister = async () => {
 const validUsers = batchUsers
 .filter(u => u.username)
 .map(u => ({
 ...u,
 password: useUnifiedPassword ? unifiedPassword : u.password
 }))
 
 if (validUsers.length === 0) {
 alert('请至少填写一个用户名')
 return
 }

 if (useUnifiedPassword && !unifiedPassword) {
 alert('请输入统一密码')
 return
 }

 const usersWithoutPassword = validUsers.filter(u => !u.password)
 if (!useUnifiedPassword && usersWithoutPassword.length > 0) {
 alert('请为所有用户填写密码，或使用统一密码功能')
 return
 }

 setBatchRegistering(true)
 setBatchResults([])

 try {
 const response = await fetchWithAuth('/api/admin/users/batch-register', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ users: validUsers })
 })

 const data = await response.json()
 if (data.success && data.data) {
 const result = data.data
 const newResults: BatchResult[] = []
 validUsers.forEach((u, i) => {
 const error = result.errors.find((err: any) => err.row === i + 1)
 if (error) {
 newResults.push({ 
 success: false, 
 message: error.error,
 user: { username: u.username || '', email: u.email || '' }
 })
 } else {
 newResults.push({ 
 success: true, 
 message: '注册成功',
 user: { username: u.username || '', email: u.email || '' }
 })
 }
 })
 setBatchResults(newResults)
 fetchUsers()
 } else {
 alert(data.error || '批量注册失败')
 }
 } catch (err) {
 alert('网络错误')
 } finally {
 setBatchRegistering(false)
 }
 }

 const handleCsvDragOver = (e: React.DragEvent) => {
 e.preventDefault()
 setIsDragging(true)
 }

 const handleCsvDragLeave = (e: React.DragEvent) => {
 e.preventDefault()
 setIsDragging(false)
 }

 const handleCsvDrop = (e: React.DragEvent) => {
 e.preventDefault()
 setIsDragging(false)
 const file = e.dataTransfer.files[0]
 if (file && (file.name.endsWith('.csv') || file.name.endsWith('.txt'))) {
 setCsvFile(file)
 setCsvResults([])
 } else {
 alert('请上传 CSV 文件')
 }
 }

 const handleCsvFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
 const file = e.target.files?.[0]
 if (file) {
 setCsvFile(file)
 setCsvResults([])
 }
 }

 const handleCsvUpload = async () => {
 if (!csvFile) return

 setCsvUploading(true)
 setCsvUploadProgress(0)
 setCsvResults([])

 try {
 const formData = new FormData()
 formData.append('file', csvFile)

 const xhr = new XMLHttpRequest()
 
 xhr.upload.onprogress = (e) => {
 if (e.lengthComputable) {
 setCsvUploadProgress(Math.round((e.loaded / e.total) * 100))
 }
 }

 xhr.onload = () => {
 if (xhr.status === 200) {
 const data = JSON.parse(xhr.responseText)
 if (data.success && data.data) {
 const result = data.data
 const summary = `成功: ${result.succeeded}, 失败: ${result.failed}`
 const newResults: BatchResult[] = [
 { success: result.failed === 0, message: summary }
 ]
 result.errors.forEach((err: any) => {
 newResults.push({ 
 success: false, 
 message: `第${err.row}行 - ${err.username || '未知'}: ${err.error}`,
 user: { username: err.username || '', email: err.email || '' }
 })
 })
 setCsvResults(newResults)
 fetchUsers()
 } else {
 alert(data.error || 'CSV 导入失败')
 }
 } else {
 alert('上传失败')
 }
 setCsvUploading(false)
 }

 xhr.onerror = () => {
 alert('网络错误')
 setCsvUploading(false)
 }

 xhr.open('POST', '/api/admin/users/batch-register')
 // Token 通过 httpOnly cookie 自动携带（xhr.withCredentials = true）
 xhr.withCredentials = true
 xhr.send(formData)
 } catch (err) {
 alert('网络错误')
 setCsvUploading(false)
 }
 }

 const handleBatchEditRole = async () => {
 if (selectedUserIds.size === 0) return

 setBatchOperating(true)
 try {
 const response = await fetchWithAuth('/api/admin/users/batch-update', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 userIds: Array.from(selectedUserIds),
 role: batchEditRole
 })
 })

 const data = await response.json()
 if (data.success) {
 setShowBatchEditModal(false)
 setSelectedUserIds(new Set())
 setTableKey(k => k + 1)
 fetchUsers()
 } else {
 alert(data.error || '批量修改失败')
 }
 } catch (err) {
 alert('网络错误')
 } finally {
 setBatchOperating(false)
 }
 }

 const handleBatchDelete = async () => {
 if (selectedUserIds.size === 0) return

 setBatchOperating(true)
 try {
 const response = await fetchWithAuth('/api/admin/users/batch-delete', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 userIds: Array.from(selectedUserIds)
 })
 })

 const data = await response.json()
 if (data.success) {
 setShowBatchDeleteModal(false)
 setSelectedUserIds(new Set())
 setTableKey(k => k + 1)
 fetchUsers()
 } else {
 alert(data.error || '批量删除失败')
 }
 } catch (err) {
 alert('网络错误')
 } finally {
 setBatchOperating(false)
 }
 }

 const columns: Column<User>[] = [
 {
 key: 'username',
 label: '用户',
 render: (_, user) => (
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-full flex items-center justify-center"
 style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)' }}>
 <User className="w-5 h-5 text-foreground" />
 </div>
 <span className="text-foreground font-medium">{user.username}</span>
 </div>
 ),
 },
 {
 key: 'email',
 label: '邮箱',
 render: (_, user) => (
 <div className="flex items-center gap-2 text-muted-foreground">
 <Mail className="w-4 h-4" />
 {user.email}
 </div>
 ),
 },
 {
 key: 'role',
 label: '角色',
 render: (_, user) => (
 <div className="flex items-center gap-2">
 <span className={`tag ${getRoleDisplay(user.role).color}`}>
 {getRoleDisplay(user.role).label}
 </span>
 </div>
 ),
 },
 {
 key: '_count',
 label: '统计',
 render: (_, user) => (
 <div className="text-sm text-muted-foreground">
 <div>提交: {user._count?.submissions || 0}</div>
 <div>出题: {user._count?.problems || 0}</div>
 </div>
 ),
 },
 {
 key: 'createdAt',
 label: '注册时间',
 render: (value: string) => (
 <div className="flex items-center gap-2 text-muted-foreground">
 <Calendar className="w-4 h-4" />
 {formatDate(value)}
 </div>
 ),
 },
 {
 key: 'id',
 label: '操作',
 className: 'w-44',
 render: (_, user) => {
 // SYSTEM_ADMIN 不可被管理；ADMIN 操作者不能管理其他 ADMIN
 const locked = user.role === 'SYSTEM_ADMIN' || (!operatorIsSystemAdmin && user.role === 'ADMIN')
 const lockReason = user.role === 'SYSTEM_ADMIN'
 ? '系统管理员不可修改'
 : (!operatorIsSystemAdmin && user.role === 'ADMIN' ? '管理员不能管理其他管理员' : '')
 // 重置密码：仅 SYSTEM_ADMIN 可操作，且目标不能是 SYSTEM_ADMIN
 const canReset = operatorIsSystemAdmin && user.role !== 'SYSTEM_ADMIN'
 return (
 <div className="flex items-center justify-start gap-2" onClick={e => e.stopPropagation()}>
 <button
 onClick={() => {
 setSelectedUser(user)
 setEditRole(getUserRole(user))
 setShowEditModal(true)
 }}
 disabled={locked}
 className={`p-2 rounded-lg transition-colors ${
 locked
 ? 'text-muted-foreground cursor-not-allowed'
 : 'text-primary hover:bg-primary/5'
 }`}
 title={locked ? lockReason : '编辑'}
 >
 <Edit className="w-4 h-4" />
 </button>
 {operatorIsSystemAdmin && (
 <button
 onClick={() => {
 setResetTarget(user)
 setResetPassword('')
 }}
 disabled={!canReset}
 className={`p-2 rounded-lg transition-colors ${
 !canReset
 ? 'text-muted-foreground cursor-not-allowed'
 : 'text-yellow-600 hover:bg-yellow-600/10'
 }`}
 title={!canReset ? '系统管理员密码不可重置' : '重置密码'}
 >
 <KeyRound className="w-4 h-4" />
 </button>
 )}
 <button
 onClick={() => {
 setSelectedUser(user)
 setShowDeleteModal(true)
 }}
 disabled={locked}
 className={`p-2 rounded-lg transition-colors ${
 locked
 ? 'text-muted-foreground cursor-not-allowed'
 : 'text-error hover:bg-error/10'
 }`}
 title={locked ? lockReason : '删除'}
 >
 <Trash2 className="w-4 h-4" />
 </button>
 </div>
 )
 },
 },
 ]

 const closeBatchRegisterModal = () => {
 setShowBatchRegisterModal(false)
 setBatchUsers([{ username: '', password: '', role: 'STUDENT' }])
 setBatchResults([])
 setCsvFile(null)
 setCsvResults([])
 setCsvUploadProgress(0)
 setUseUnifiedPassword(false)
 setUnifiedPassword('')
 setActiveTab('form')
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

 if (error) {
 return (
 <div className="flex items-center justify-center min-h-screen">
 <div className="text-center">
 <p className="text-error text-lg mb-2">{error}</p>
 {error.includes('权限') && <p className="text-muted-foreground">正在跳转...</p>}
 </div>
 </div>
 )
 }

 return (
 <>
 <div className="space-y-6">
 <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-xl flex items-center justify-center"
 style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)' }}>
 <Users className="w-5 h-5 text-white" />
 </div>
 <div>
 <h1 className="text-2xl font-bold text-foreground">用户管理</h1>
 <p className="text-sm text-muted-foreground">管理系统用户和权限</p>
 </div>
 </div>
 <button
 onClick={() => setShowBatchRegisterModal(true)}
 className="btn btn-primary flex items-center gap-2"
 >
 <UserPlus className="w-4 h-4" />
 批量注册
 </button>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div className="card p-4">
 <div className="text-muted-foreground text-sm">总用户数</div>
 <div className="text-3xl font-bold text-foreground mt-1">{users.length}</div>
 {(() => {
 const weeklyGrowth = getWeeklyGrowth(users)
 if (weeklyGrowth <= 0) return null
 return (
 <div className="text-xs text-secondary-light mt-2 flex items-center gap-1">
 <TrendingUp className="w-3 h-3" />
 本周新增 {weeklyGrowth} 人
 </div>
 )
 })()}
 </div>
 <div className="card p-4">
 <div className="text-muted-foreground text-sm mb-2">角色分布</div>
 <div className="space-y-2">
 {ROLE_ORDER.map(role => {
 const count = users.filter(u => getUserRole(u) === role).length
 const percent = users.length > 0 ? (count / users.length) * 100 : 0
 const display = getRoleDisplay(role)
 const barColor = ROLE_BAR_COLOR[role] || 'bg-primary'
 return (
 <div key={role} className="flex items-center gap-2">
 <div className="w-20 text-xs text-muted-foreground shrink-0">{display.label}</div>
 <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
 <div
 className={`h-full ${barColor} transition-all duration-300`}
 style={{ width: `${percent}%` }}
 />
 </div>
 <div className="w-20 text-xs text-foreground text-right shrink-0">
 {count} <span className="text-muted-foreground">({percent.toFixed(0)}%)</span>
 </div>
 </div>
 )
 })}
 </div>
 </div>
 </div>

 <div className="card p-4">
 <div className="flex gap-4 flex-wrap items-center">
 <div className="flex-1 min-w-[200px]">
 <div className="relative">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
 <input
 type="text"
 placeholder="搜索用户名或邮箱..."
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 className="input pl-10"
 />
 </div>
 </div>
 <div className="flex gap-1 p-1 rounded-lg bg-muted">
 {[
 { id: 'all', label: '全部' },
 { id: 'SYSTEM_ADMIN', label: '系统管理员' },
 { id: 'ADMIN', label: '管理员' },
 { id: 'TEACHER', label: '教师' },
 { id: 'STUDENT', label: '学生' }
 ].map(tab => (
 <button
 key={tab.id}
 onClick={() => setRoleFilter(tab.id)}
 className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
 roleFilter === tab.id
 ? 'bg-primary text-foreground'
 : 'text-muted-foreground hover:text-foreground hover:bg-muted'
 }`}
 >
 {tab.label}
 </button>
 ))}
 </div>
 </div>
 </div>

 <DataTable
 data={filteredUsers}
 columns={columns}
 idKey="id"
 key={tableKey}
 emptyMessage={searchQuery || roleFilter !== 'all' ? '没有找到匹配的用户' : '暂无用户'}
 onRowClick={(row) => {
 // 与编辑按钮一致的锁定判断：系统管理员 / （非系统管理员操作时的）管理员不可编辑
 const locked = row.role === 'SYSTEM_ADMIN' || (!operatorIsSystemAdmin && row.role === 'ADMIN')
 if (locked) return
 setSelectedUser(row)
 setEditRole(getUserRole(row))
 setShowEditModal(true)
 }}
 batchActions={[
 { label: '批量修改角色', action: (ids) => { setSelectedUserIds(new Set(ids)); setShowBatchEditModal(true) } },
 { label: '批量删除', action: (ids) => { setSelectedUserIds(new Set(ids)); setShowBatchDeleteModal(true) }, danger: true },
 ]}
 />
 </div>

 {showEditModal && selectedUser && (
 <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110]">
 <div className="card p-6 max-w-md w-full mx-4">
 <h3 className="text-lg font-bold text-foreground mb-4">编辑用户角色</h3>
 <div className="mb-4">
 <label className="block text-sm font-medium text-muted-foreground mb-2">用户名</label>
 <input
 type="text"
 value={selectedUser.username}
 disabled
 className="input opacity-50 cursor-not-allowed"
 />
 </div>
 <div className="mb-6">
 <label className="block text-sm font-medium text-muted-foreground mb-2">角色</label>
 <select
 value={editRole}
 onChange={(e) => setEditRole(e.target.value)}
 className="input"
 >
 <option value="STUDENT">学生</option>
 <option value="TEACHER">教师</option>
 {operatorIsSystemAdmin && <option value="ADMIN">管理员</option>}
 </select>
 </div>
 <div className="flex gap-3 justify-end">
 <button
 onClick={() => {
 setShowEditModal(false)
 setSelectedUser(null)
 }}
 className="btn btn-ghost"
 >
 取消
 </button>
 <button
 onClick={handleEditUser}
 className="btn btn-primary"
 >
 保存
 </button>
 </div>
 </div>
 </div>
 )}

 {resetTarget && (
 <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110]">
 <div className="card p-6 max-w-md w-full mx-4">
 <h3 className="text-lg font-bold text-foreground mb-1">重置密码</h3>
 <p className="text-sm text-muted-foreground mb-4">
 为用户 <span className="text-foreground font-medium">{resetTarget.username}</span> 设置新密码
 </p>
 <div className="mb-6">
 <label className="block text-sm font-medium text-muted-foreground mb-2">新密码</label>
 <input
 type="password"
 value={resetPassword}
 onChange={(e) => setResetPassword(e.target.value)}
 placeholder="至少6位"
 className="input"
 autoComplete="new-password"
 />
 </div>
 <div className="flex gap-3 justify-end">
 <button
 onClick={() => {
 setResetTarget(null)
 setResetPassword('')
 }}
 disabled={resetting}
 className="btn btn-ghost"
 >
 取消
 </button>
 <button
 onClick={handleResetPassword}
 disabled={resetting}
 className="btn btn-primary"
 >
 {resetting ? '重置中...' : '确认重置'}
 </button>
 </div>
 </div>
 </div>
 )}

 {showDeleteModal && selectedUser && (
 <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110]">
 <div className="card p-6 max-w-md w-full mx-4">
 <h3 className="text-lg font-bold text-foreground mb-4">确认删除</h3>
 <p className="text-muted-foreground mb-6">
 确定要删除用户 <span className="text-foreground font-medium">{selectedUser.username}</span> 吗？
 此操作无法撤销。
 </p>
 <div className="flex gap-3 justify-end">
 <button
 onClick={() => {
 setShowDeleteModal(false)
 setSelectedUser(null)
 }}
 className="btn btn-ghost"
 >
 取消
 </button>
 <button
 onClick={handleDeleteUser}
 className="btn btn-destructive"
 >
 确认删除
 </button>
 </div>
 </div>
 </div>
 )}

 {showBatchRegisterModal && (
 <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] overflow-y-auto py-4">
 <div className="card p-6 max-w-4xl w-full mx-4 my-auto">
 <div className="flex items-center justify-between mb-6">
 <h3 className="text-lg font-bold text-foreground">批量注册用户</h3>
 <button
 onClick={closeBatchRegisterModal}
 className="p-2 hover:bg-muted rounded-lg transition-colors"
 >
 <X className="w-5 h-5 text-muted-foreground" />
 </button>
 </div>

 <div className="flex border-b border-slate-200 mb-6">
 <button
 onClick={() => { setActiveTab('form'); setCsvFile(null); setCsvResults([]); }}
 className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
 activeTab === 'form' ? 'text-primary border-primary' : 'text-muted-foreground border-transparent hover:text-foreground'
 }`}
 >
 表单输入
 </button>
 <button
 onClick={() => setActiveTab('csv')}
 className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
 activeTab === 'csv' ? 'text-primary border-primary' : 'text-muted-foreground border-transparent hover:text-foreground'
 }`}
 >
 CSV 导入
 </button>
 </div>

 {activeTab === 'form' ? (
 <div className="space-y-4">
 <div className="flex items-center gap-4 p-3 bg-muted rounded-lg">
 <label className="flex items-center gap-2 cursor-pointer">
 <input
 type="checkbox"
 checked={useUnifiedPassword}
 onChange={(e) => setUseUnifiedPassword(e.target.checked)}
 className="w-4 h-4 rounded border-border bg-muted text-primary focus:ring-primary"
 />
 <span className="text-sm text-muted-foreground">使用统一密码</span>
 </label>
 {useUnifiedPassword && (
 <input
 type="text"
 placeholder="输入统一密码"
 value={unifiedPassword}
 onChange={(e) => setUnifiedPassword(e.target.value)}
 className="input text-sm flex-1 max-w-[200px]"
 />
 )}
 </div>

 <div className="max-h-[400px] overflow-y-auto space-y-3">
 <div className="grid grid-cols-12 gap-2 items-center px-3 py-2 text-xs text-muted-foreground font-medium">
 <div className="col-span-3">用户名</div>
 <div className="col-span-3">邮箱（可选）</div>
 <div className={`col-span-2 ${useUnifiedPassword ? 'opacity-50' : ''}`}>
 密码{useUnifiedPassword && '（已统一）'}
 </div>
 <div className="col-span-3">角色</div>
 <div className="col-span-1"></div>
 </div>
 {batchUsers.map((user, index) => (
 <div key={index} className="grid grid-cols-12 gap-2 items-center p-3 bg-muted rounded-lg">
 <div className="col-span-3">
 <input
 type="text"
 placeholder="用户名"
 value={user.username}
 onChange={(e) => updateBatchUser(index, 'username', e.target.value)}
 className="input text-sm"
 />
 </div>
 <div className="col-span-3">
 <input
 type="email"
 placeholder="邮箱（可选）"
 value={user.email || ''}
 onChange={(e) => updateBatchUser(index, 'email', e.target.value)}
 className="input text-sm"
 />
 </div>
 <div className="col-span-2">
 <input
 type="text"
 placeholder={useUnifiedPassword ? '使用统一密码' : '密码'}
 value={useUnifiedPassword ? unifiedPassword : user.password}
 onChange={(e) => !useUnifiedPassword && updateBatchUser(index, 'password', e.target.value)}
 disabled={useUnifiedPassword}
 className={`input text-sm ${useUnifiedPassword ? 'opacity-50 cursor-not-allowed' : ''}`}
 />
 </div>
 <div className="col-span-3">
 <select
 value={user.role}
 onChange={(e) => updateBatchUser(index, 'role', e.target.value)}
 className="input text-sm"
 >
 <option value="STUDENT">学生</option>
 <option value="TEACHER">教师</option>
 {operatorIsSystemAdmin && <option value="ADMIN">管理员</option>}
 </select>
 </div>
 <div className="col-span-1 flex justify-center">
 <button
 onClick={() => removeBatchUser(index)}
 disabled={batchUsers.length === 1}
 className="p-2 text-error hover:bg-error/10 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
 >
 <X className="w-4 h-4" />
 </button>
 </div>
 </div>
 ))}
 </div>

 <button
 onClick={addBatchUser}
 className="btn btn-ghost w-full flex items-center justify-center gap-2"
 >
 <Plus className="w-4 h-4" />
 添加用户
 </button>

 {batchResults.length > 0 && (
 <div className="mt-4 p-4 bg-muted rounded-lg max-h-[200px] overflow-y-auto">
 <h4 className="text-sm font-medium text-foreground mb-2">注册结果</h4>
 <div className="space-y-2">
 {batchResults.map((result, index) => (
 <div key={index} className={`flex items-center gap-2 text-sm ${result.success ? 'text-secondary-light' : 'text-error'}`}>
 {result.success ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
 <span>{result.user?.username || '未知'}: {result.message}</span>
 </div>
 ))}
 </div>
 </div>
 )}

 <div className="flex gap-3 justify-end pt-4 border-t border-slate-200">
 <button
 onClick={closeBatchRegisterModal}
 className="btn btn-ghost"
 >
 取消
 </button>
 <button
 onClick={handleBatchRegister}
 disabled={batchRegistering}
 className="btn btn-primary flex items-center gap-2"
 >
 {batchRegistering && <Loader2 className="w-4 h-4 animate-spin" />}
 {batchRegistering ? '注册中...' : '开始注册'}
 </button>
 </div>
 </div>
 ) : (
 <div className="space-y-4">
 <div
 className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
 isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-foreground/40'
 }`}
 onDragOver={handleCsvDragOver}
 onDragLeave={handleCsvDragLeave}
 onDrop={handleCsvDrop}
 >
 <input
 ref={fileInputRef}
 type="file"
 accept=".csv,.txt"
 onChange={handleCsvFileSelect}
 className="hidden"
 />
 <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
 <p className="text-foreground mb-2">拖拽 CSV 文件到此处</p>
 <p className="text-muted-foreground text-sm mb-4">或</p>
 <button
 onClick={() => fileInputRef.current?.click()}
 className="btn btn-ghost"
 >
 选择文件
 </button>
 <p className="text-muted-foreground text-xs mt-4">
 格式: 用户名,密码,角色(STUDENT/TEACHER{operatorIsSystemAdmin ? '/ADMIN' : ''})，邮箱可选
 </p>
 <a
 href="/templates/users-template.csv"
 download
 className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary mt-2"
 >
 <Download className="w-3.5 h-3.5" />
 下载CSV模板
 </a>
 </div>

 {csvFile && (
 <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
 <FileText className="w-5 h-5 text-primary" />
 <span className="text-foreground flex-1">{csvFile.name}</span>
 <button
 onClick={() => setCsvFile(null)}
 className="p-1 hover:bg-muted rounded"
 >
 <X className="w-4 h-4 text-muted-foreground" />
 </button>
 </div>
 )}

 {csvUploading && (
 <div className="space-y-2">
 <div className="flex items-center justify-between text-sm">
 <span className="text-muted-foreground">上传进度</span>
 <span className="text-foreground">{csvUploadProgress}%</span>
 </div>
 <div className="h-2 bg-muted rounded-full overflow-hidden">
 <div
 className="h-full bg-primary transition-all duration-300"
 style={{ width: `${csvUploadProgress}%` }}
 />
 </div>
 </div>
 )}

 {csvResults.length > 0 && (
 <div className="mt-4 p-4 bg-muted rounded-lg max-h-[200px] overflow-y-auto">
 <h4 className="text-sm font-medium text-foreground mb-2">导入结果</h4>
 <div className="space-y-2">
 {csvResults.map((result, index) => (
 <div key={index} className={`flex items-center gap-2 text-sm ${result.success ? 'text-secondary-light' : 'text-error'}`}>
 {result.success ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
 <span>{result.user?.username || '未知'}: {result.message}</span>
 </div>
 ))}
 </div>
 </div>
 )}

 <div className="flex gap-3 justify-end pt-4 border-t border-slate-200">
 <button
 onClick={closeBatchRegisterModal}
 className="btn btn-ghost"
 >
 关闭
 </button>
 <button
 onClick={handleCsvUpload}
 disabled={!csvFile || csvUploading}
 className="btn btn-primary flex items-center gap-2"
 >
 {csvUploading && <Loader2 className="w-4 h-4 animate-spin" />}
 {csvUploading ? '导入中...' : '开始导入'}
 </button>
 </div>
 </div>
 )}
 </div>
 </div>
 )}

 {showBatchEditModal && (
 <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110]">
 <div className="card p-6 max-w-md w-full mx-4">
 <h3 className="text-lg font-bold text-foreground mb-4">批量修改角色</h3>
 <p className="text-muted-foreground mb-4">
 将选中的 <span className="text-foreground font-medium">{selectedUserIds.size}</span> 个用户的角色修改为：
 </p>
 <div className="mb-6">
 <select
 value={batchEditRole}
 onChange={(e) => setBatchEditRole(e.target.value)}
 className="input"
 >
 <option value="STUDENT">学生</option>
 <option value="TEACHER">教师</option>
 {operatorIsSystemAdmin && <option value="ADMIN">管理员</option>}
 </select>
 </div>
 <div className="flex gap-3 justify-end">
 <button
 onClick={() => setShowBatchEditModal(false)}
 className="btn btn-ghost"
 >
 取消
 </button>
 <button
 onClick={handleBatchEditRole}
 disabled={batchOperating}
 className="btn btn-primary flex items-center gap-2"
 >
 {batchOperating && <Loader2 className="w-4 h-4 animate-spin" />}
 确认修改
 </button>
 </div>
 </div>
 </div>
 )}

 {showBatchDeleteModal && (
 <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110]">
 <div className="card p-6 max-w-md w-full mx-4">
 <h3 className="text-lg font-bold text-foreground mb-4">批量删除用户</h3>
 <p className="text-muted-foreground mb-6">
 确定要删除选中的 <span className="text-foreground font-medium">{selectedUserIds.size}</span> 个用户吗？
 此操作无法撤销。
 </p>
 <div className="flex gap-3 justify-end">
 <button
 onClick={() => setShowBatchDeleteModal(false)}
 className="btn btn-ghost"
 >
 取消
 </button>
 <button
 onClick={handleBatchDelete}
 disabled={batchOperating}
 className="btn btn-destructive flex items-center gap-2"
 >
 {batchOperating && <Loader2 className="w-4 h-4 animate-spin" />}
 确认删除
 </button>
 </div>
 </div>
 </div>
 )}
 </>
 )
}