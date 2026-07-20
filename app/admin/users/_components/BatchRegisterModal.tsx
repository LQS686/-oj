'use client'

import { useState, useRef } from 'react'
import {
  Upload, X, Plus, FileText, AlertCircle, CheckCircle, Loader2, Download,
} from 'lucide-react'
import { fetchWithCookie } from '@/lib/api/base'
import type { BatchUser, BatchResult } from '../_utils'

interface BatchRegisterModalProps {
  operatorIsSystemAdmin: boolean
  onClose: () => void
  onSuccess: () => void
}

/**
 * 批量注册用户对话框，含两个 Tab：
 * - 表单输入：逐行填写用户名/邮箱/密码/角色，支持统一密码
 * - CSV 导入：拖拽或选择 CSV 文件，带上传进度
 *
 * 内部维护全部表单/CSV 状态；关闭时由父组件卸载即重置。
 */
export function BatchRegisterModal({
  operatorIsSystemAdmin,
  onClose,
  onSuccess,
}: BatchRegisterModalProps) {
  const [activeTab, setActiveTab] = useState<'form' | 'csv'>('form')

  // 表单输入状态
  const [batchUsers, setBatchUsers] = useState<BatchUser[]>([
    { username: '', password: '', role: 'STUDENT' }
  ])
  const [useUnifiedPassword, setUseUnifiedPassword] = useState(false)
  const [unifiedPassword, setUnifiedPassword] = useState('')
  const [batchRegistering, setBatchRegistering] = useState(false)
  const [batchResults, setBatchResults] = useState<BatchResult[]>([])

  // CSV 导入状态
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvUploading, setCsvUploading] = useState(false)
  const [csvUploadProgress, setCsvUploadProgress] = useState(0)
  const [csvResults, setCsvResults] = useState<BatchResult[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
      const response = await fetchWithCookie('/api/admin/users/batch-register', {
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
        onSuccess()
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
            onSuccess()
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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] overflow-y-auto py-4">
      <div className="card p-6 max-w-2xl w-full mx-4 my-auto max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-foreground">批量注册用户</h3>
          <button
            onClick={onClose}
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
              <div className="hidden sm:grid grid-cols-1 sm:grid-cols-12 gap-2 items-center px-3 py-2 text-xs text-muted-foreground font-medium">
                <div className="col-span-3">用户名</div>
                <div className="col-span-3">邮箱（可选）</div>
                <div className={`col-span-2 ${useUnifiedPassword ? 'opacity-50' : ''}`}>
                  密码{useUnifiedPassword && '（已统一）'}
                </div>
                <div className="col-span-3">角色</div>
                <div className="col-span-1"></div>
              </div>
              {batchUsers.map((user, index) => (
                <div key={index} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center p-3 bg-muted rounded-lg">
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
              <button onClick={onClose} className="btn btn-ghost">
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
              <button onClick={onClose} className="btn btn-ghost">
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
  )
}
