'use client'

/**
 * app/admin/trainings/categories/page.tsx
 * 管理后台 - 题单分类管理
 */
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import AdminLayout from '@/components/AdminLayout'
import {
  ArrowLeft, Plus, Edit, Trash2, X, Save, AlertCircle, RefreshCw
} from 'lucide-react'
import toast from 'react-hot-toast'

interface Category {
  id: string
  name: string
  description: string | null
  orderIndex: number
  _count?: { trainings: number }
}

export default function TrainingCategoriesPage() {
  const [items, setItems] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editOrder, setEditOrder] = useState(0)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newOrder, setNewOrder] = useState(0)
  const [saving, setSaving] = useState(false)

  const loadCategories = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/training-categories', { cache: 'no-store' })
      const data = await res.json()
      setItems(Array.isArray(data?.data?.items) ? data.data.items : [])
    } catch {
      setError('加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadCategories() }, [loadCategories])

  const handleCreate = async () => {
    if (!newName.trim()) { toast.error('请输入分类名'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/training-categories', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || undefined, orderIndex: newOrder }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('创建成功')
        setShowCreate(false)
        setNewName(''); setNewDesc(''); setNewOrder(0)
        loadCategories()
      } else {
        toast.error(data.error || '创建失败')
      }
    } catch {
      toast.error('网络错误')
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (cat: Category) => {
    setEditingId(cat.id)
    setEditName(cat.name)
    setEditDesc(cat.description || '')
    setEditOrder(cat.orderIndex)
  }

  const handleSave = async () => {
    if (!editingId) return
    setSaving(true)
    try {
      const res = await fetch(`/api/training-categories/${editingId}`, {
        method: 'PUT',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName, description: editDesc, orderIndex: editOrder }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('保存成功')
        setEditingId(null)
        loadCategories()
      } else {
        toast.error(data.error || '保存失败')
      }
    } catch {
      toast.error('网络错误')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string, name: string, used: number) => {
    if (used > 0) {
      toast.error(`该分类仍有 ${used} 个题单，无法删除`)
      return
    }
    if (!confirm(`确定删除分类「${name}」？`)) return
    try {
      const res = await fetch(`/api/training-categories/${id}`, {
        method: 'DELETE',
        cache: 'no-store',
      })
      const data = await res.json()
      if (data.success) {
        toast.success('删除成功')
        loadCategories()
      } else {
        toast.error(data.error || '删除失败')
      }
    } catch {
      toast.error('网络错误')
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/trainings" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold text-foreground">题单分类管理</h1>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary btn">
          <Plus className="w-4 h-4" />
          新建分类
        </button>
      </div>

      {showCreate && (
        <div className="card-static p-4 space-y-3">
          <h3 className="font-semibold text-foreground">新建分类</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="分类名"
              className="px-3 py-2 bg-muted/30 border border-border rounded-lg text-sm text-foreground"
            />
            <input
              type="text"
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              placeholder="描述（可选）"
              className="px-3 py-2 bg-muted/30 border border-border rounded-lg text-sm text-foreground"
            />
            <input
              type="number"
              value={newOrder}
              onChange={e => setNewOrder(parseInt(e.target.value) || 0)}
              placeholder="排序（数字越小越靠前）"
              className="px-3 py-2 bg-muted/30 border border-border rounded-lg text-sm text-foreground"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => { setShowCreate(false); setNewName(''); setNewDesc('') }} className="btn-ghost btn">
              <X className="w-4 h-4" />
              取消
            </button>
            <button onClick={handleCreate} disabled={saving} className="btn-primary btn">
              <Save className="w-4 h-4" />
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      )}

      <div className="card-static overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-muted-foreground">加载中...</div>
        ) : error ? (
          <div className="py-12 text-center">
            <AlertCircle className="w-10 h-10 mx-auto mb-3 text-error" />
            <p className="text-foreground mb-4">{error}</p>
            <button onClick={loadCategories} className="btn-primary btn">
              <RefreshCw className="w-4 h-4" /> 重试
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">暂无分类</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">名称</th>
                <th className="px-4 py-3 text-left font-medium">描述</th>
                <th className="px-4 py-3 text-center font-medium">题单数</th>
                <th className="px-4 py-3 text-center font-medium">排序</th>
                <th className="px-4 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map(cat => (
                <tr key={cat.id} className="border-t border-border">
                  {editingId === cat.id ? (
                    <>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          className="w-full px-2 py-1 bg-background border border-border rounded text-sm text-foreground"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={editDesc}
                          onChange={e => setEditDesc(e.target.value)}
                          className="w-full px-2 py-1 bg-background border border-border rounded text-sm text-foreground"
                        />
                      </td>
                      <td className="px-4 py-2 text-center text-muted-foreground">
                        {cat._count?.trainings || 0}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <input
                          type="number"
                          value={editOrder}
                          onChange={e => setEditOrder(parseInt(e.target.value) || 0)}
                          className="w-20 px-2 py-1 bg-background border border-border rounded text-sm text-foreground"
                        />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={handleSave} disabled={saving} className="p-1.5 rounded text-success hover:bg-success/10" title="保存">
                            <Save className="w-4 h-4" />
                          </button>
                          <button onClick={() => setEditingId(null)} className="p-1.5 rounded text-muted-foreground hover:bg-muted" title="取消">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 font-medium text-foreground">{cat.name}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{cat.description || '-'}</td>
                      <td className="px-4 py-3 text-center">{cat._count?.trainings || 0}</td>
                      <td className="px-4 py-3 text-center text-muted-foreground">{cat.orderIndex}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => startEdit(cat)}
                            className="p-1.5 rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                            title="编辑"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(cat.id, cat.name, cat._count?.trainings || 0)}
                            className="p-1.5 rounded text-muted-foreground hover:text-error hover:bg-error/10"
                            title="删除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      </div>
    </AdminLayout>
  )
}
