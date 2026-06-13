'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import { fetchWithAuth } from '@/lib/api/base'
import { Users, Search, Shield, User, Mail, Calendar, MoreHorizontal, Edit, Trash2, ShieldCheck, ShieldOff, UserPlus, Upload, X, Plus, CheckSquare, Square, FileText, AlertCircle, CheckCircle, Loader2, Download } from 'lucide-react'
import { getRoleLabel, getRoleColor, isAdmin } from '@/lib/permissions'

interface User {
  id: string
  username: string
  email: string
  role: string
  isAdmin: boolean
  isSuperAdmin: boolean
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
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [editRole, setEditRole] = useState('')
  
  const [showBatchRegisterModal, setShowBatchRegisterModal] = useState(false)
  const [batchUsers, setBatchUsers] = useState<BatchUser[]>([
    { username: '', password: '', role: 'USER' }
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
  const [batchEditRole, setBatchEditRole] = useState('USER')
  const [batchOperating, setBatchOperating] = useState(false)

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      setLoading(true)
      const response = await fetchWithAuth('/api/admin/users')

      if (response.status === 403) {
        setError('需要管理员权限')
        setTimeout(() => router.push('/'), 2000)
        return
      }

      const data = await response.json()
      if (data.success) {
        setUsers(Array.isArray(data.data) ? data.data : [])
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
    if (isAdmin(user)) return 'ADMIN'
    if (user.role && user.role !== 'USER') return user.role
    return user.role || 'USER'
  }

  const filteredUsers = users.filter(user => {
    const actualRole = getUserRole(user)
    const matchesSearch = user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesRole = roleFilter === 'all' || actualRole === roleFilter
    return matchesSearch && matchesRole
  })

  const addBatchUser = () => {
    setBatchUsers([...batchUsers, { username: '', password: '', role: 'USER' }])
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
      const token = localStorage.getItem('token')
      if (token && token !== 'null' && token !== 'undefined') {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      }
      xhr.withCredentials = true
      xhr.send(formData)
    } catch (err) {
      alert('网络错误')
      setCsvUploading(false)
    }
  }

  const toggleSelectAll = () => {
    if (selectedUserIds.size === filteredUsers.length) {
      setSelectedUserIds(new Set())
    } else {
      setSelectedUserIds(new Set(filteredUsers.map(u => u.id)))
    }
  }

  const toggleSelectUser = (userId: string) => {
    const newSelected = new Set(selectedUserIds)
    if (newSelected.has(userId)) {
      newSelected.delete(userId)
    } else {
      newSelected.add(userId)
    }
    setSelectedUserIds(newSelected)
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

  const closeBatchRegisterModal = () => {
    setShowBatchRegisterModal(false)
    setBatchUsers([{ username: '', password: '', role: 'USER' }])
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

  if (error) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <p className="text-error text-lg mb-2">{error}</p>
            {error.includes('权限') && <p className="text-muted-foreground">正在跳转...</p>}
          </div>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
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

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="card p-4">
            <div className="text-muted-foreground text-sm">总用户数</div>
            <div className="text-2xl font-bold text-foreground mt-1">{users.length}</div>
          </div>
          <div className="card p-4">
            <div className="text-muted-foreground text-sm">管理员</div>
            <div className="text-2xl font-bold text-error mt-1">
              {users.filter(u => getUserRole(u) === 'ADMIN').length}
            </div>
          </div>
          <div className="card p-4">
            <div className="text-muted-foreground text-sm">教师</div>
            <div className="text-2xl font-bold text-accent-light mt-1">
              {users.filter(u => getUserRole(u) === 'TEACHER').length}
            </div>
          </div>
          <div className="card p-4">
            <div className="text-muted-foreground text-sm">普通用户</div>
            <div className="text-2xl font-bold text-primary-light mt-1">
              {users.filter(u => getUserRole(u) === 'USER').length}
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
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="input w-auto"
            >
              <option value="all">全部角色</option>
              <option value="ADMIN">管理员</option>
              <option value="TEACHER">教师</option>
              <option value="USER">用户</option>
            </select>
          </div>
        </div>

        {selectedUserIds.size > 0 && (
          <div className="card p-4 bg-primary/5 border-primary/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-primary" />
                <span className="text-foreground">已选择 {selectedUserIds.size} 个用户</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowBatchEditModal(true)}
                  className="btn btn-ghost text-primary"
                >
                  <Edit className="w-4 h-4 mr-1" />
                  批量修改角色
                </button>
                <button
                  onClick={() => setShowBatchDeleteModal(true)}
                  className="btn btn-ghost text-error"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  批量删除
                </button>
                <button
                  onClick={() => setSelectedUserIds(new Set())}
                  className="btn btn-ghost"
                >
                  取消选择
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-12">
                    <button
                      onClick={toggleSelectAll}
                      className="p-1 hover:bg-muted/50 rounded"
                    >
                      {selectedUserIds.size === filteredUsers.length && filteredUsers.length > 0 ? (
                        <CheckSquare className="w-4 h-4 text-primary" />
                      ) : (
                        <Square className="w-4 h-4 text-muted-foreground" />
                      )}
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    用户
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    邮箱
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    角色
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    统计
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    注册时间
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className={`hover:bg-muted/50 transition-colors ${selectedUserIds.has(user.id) ? 'bg-primary/5' : ''}`}>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => toggleSelectUser(user.id)}
                        className="p-1 hover:bg-muted/50 rounded"
                      >
                        {selectedUserIds.has(user.id) ? (
                          <CheckSquare className="w-4 h-4 text-primary" />
                        ) : (
                          <Square className="w-4 h-4 text-muted-foreground" />
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center"
                          style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)' }}>
                          <User className="w-5 h-5 text-foreground" />
                        </div>
                        <span className="text-foreground font-medium">{user.username}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="w-4 h-4" />
                        {user.email}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className={`tag ${getRoleColor(user.role, user.isAdmin)}`}>
                          {getRoleLabel(user.role, user.isAdmin)}
                        </span>
                        {user.isSuperAdmin && (
                          <span className="text-xs text-accent-light bg-amber-400/10 px-2 py-0.5 rounded">
                            超管
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-muted-foreground">
                        <div>提交: {user._count?.submissions || 0}</div>
                        <div>出题: {user._count?.problems || 0}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="w-4 h-4" />
                        {new Date(user.createdAt).toLocaleDateString('zh-CN')}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setSelectedUser(user)
                            setEditRole(getUserRole(user))
                            setShowEditModal(true)
                          }}
                          disabled={user.isSuperAdmin}
                          className={`p-2 rounded-lg transition-colors ${
                            user.isSuperAdmin 
                              ? 'text-muted-foreground cursor-not-allowed' 
                              : 'text-primary hover:bg-primary/5'
                          }`}
                          title={user.isSuperAdmin ? '超级管理员不可修改' : '编辑'}
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedUser(user)
                            setShowDeleteModal(true)
                          }}
                          disabled={user.isSuperAdmin}
                          className={`p-2 rounded-lg transition-colors ${
                            user.isSuperAdmin 
                              ? 'text-muted-foreground cursor-not-allowed' 
                              : 'text-error hover:bg-error/10'
                          }`}
                          title={user.isSuperAdmin ? '超级管理员不可删除' : '删除'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredUsers.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              {searchQuery || roleFilter !== 'all' ? '没有找到匹配的用户' : '暂无用户'}
            </div>
          )}
        </div>
      </div>

      {showEditModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
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
                <option value="USER">用户</option>
                <option value="TEACHER">教师</option>
                <option value="ADMIN">管理员</option>
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

      {showDeleteModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 overflow-y-auto py-4">
          <div className="card p-6 max-w-4xl w-full mx-4 my-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-foreground">批量注册用户</h3>
              <button
                onClick={closeBatchRegisterModal}
                className="p-2 hover:bg-muted/50 rounded-lg transition-colors"
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
                <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useUnifiedPassword}
                      onChange={(e) => setUseUnifiedPassword(e.target.checked)}
                      className="w-4 h-4 rounded border-border bg-muted/50 text-primary focus:ring-primary"
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
                    <div key={index} className="grid grid-cols-12 gap-2 items-center p-3 bg-muted/50 rounded-lg">
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
                          <option value="USER">用户</option>
                          <option value="TEACHER">教师</option>
                          <option value="ADMIN">管理员</option>
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
                  <div className="mt-4 p-4 bg-muted/50 rounded-lg max-h-[200px] overflow-y-auto">
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
                    格式: 用户名,密码,角色(USER/TEACHER/ADMIN)，邮箱可选
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
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                    <FileText className="w-5 h-5 text-primary" />
                    <span className="text-foreground flex-1">{csvFile.name}</span>
                    <button
                      onClick={() => setCsvFile(null)}
                      className="p-1 hover:bg-muted/50 rounded"
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
                    <div className="h-2 bg-muted/50 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${csvUploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {csvResults.length > 0 && (
                  <div className="mt-4 p-4 bg-muted/50 rounded-lg max-h-[200px] overflow-y-auto">
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
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
                <option value="USER">用户</option>
                <option value="TEACHER">教师</option>
                <option value="ADMIN">管理员</option>
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
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
    </AdminLayout>
  )
}
