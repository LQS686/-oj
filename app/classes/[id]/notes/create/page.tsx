'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useUser } from '@/contexts/UserContext'
import { fetchWithAuth } from '@/lib/api/base'
import { FileText, Tag, AlertCircle } from 'lucide-react'
import { ClassWorkspaceShell } from '@/components/common'
import { useClass } from '@/hooks/useClass'

export default function CreateNotePage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useUser()
  const classId = params.id as string
  const { classData } = useClass(classId)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [formData, setFormData] = useState({
    title: '',
    content: '',
    category: 'General',
    tags: '',
  })

  const categories = [
    'General',
    '算法',
    '数据结构',
    '动态规划',
    '图论',
    '字符串',
    '数学',
    '其他',
  ]

  useEffect(() => {
    if (!user) {
      router.push('/login')
    }
  }, [user, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!formData.title.trim()) {
      setError('请输入笔记标题')
      return
    }

    if (!formData.content.trim()) {
      setError('请输入笔记内容')
      return
    }

    try {
      setLoading(true)

      const response = await fetchWithAuth(`/api/classes/${classId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title,
          content: formData.content,
          category: formData.category,
          tags: formData.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      })

      const data = await response.json()

      if (data.success) {
        setSuccess('笔记创建成功')
        setTimeout(() => {
          router.push(`/classes/${classId}/notes`)
        }, 1200)
      } else {
        setError(data.error || '创建失败')
      }
    } catch {
      setError('创建失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ClassWorkspaceShell
      classId={classId}
      className={classData?.name}
      title="创建笔记"
      description="分享学习心得和解题思路（支持 Markdown）"
      icon={FileText}
      width="narrow"
    >
      <div className="bg-card rounded-lg border border-border p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              笔记标题 <span className="text-error">*</span>
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="例如：二分查找算法总结"
              maxLength={100}
              className="input w-full"
              required
            />
            <p className="mt-1 text-sm text-muted-foreground">{formData.title.length}/100</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">分类</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="input w-full"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">标签</label>
              <div className="relative">
                <input
                  type="text"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  placeholder="多个标签用逗号分隔"
                  className="input w-full pr-10"
                />
                <Tag className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">例如：贪心算法, 基础题</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              笔记内容 <span className="text-error">*</span>
            </label>
            <textarea
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              placeholder="支持 Markdown…"
              rows={16}
              className="input w-full font-mono text-sm"
              required
            />
            <p className="mt-1 text-sm text-muted-foreground">{formData.content.length} 字符</p>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex items-start gap-2">
              <FileText className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-2">Markdown 提示</p>
                <p>
                  <code className="bg-muted px-1 rounded text-xs"># 标题</code>、
                  <code className="bg-muted px-1 rounded text-xs">**粗体**</code>、
                  <code className="bg-muted px-1 rounded text-xs">`代码`</code>、代码块用三个反引号
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                <li>笔记创建后班级成员可查看</li>
                <li>仅作者可编辑、删除</li>
                <li>建议使用清晰标题与标签便于搜索</li>
              </ul>
            </div>
          </div>

          {error && (
            <div className="p-4 bg-error/10 border border-error/20 rounded-lg">
              <p className="text-sm text-error">{error}</p>
            </div>
          )}

          {success && (
            <div className="p-4 bg-secondary/10 border border-secondary/20 rounded-lg">
              <p className="text-sm text-secondary">{success}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button type="submit" disabled={loading} className="btn btn-primary flex-1">
              {loading ? '创建中...' : '创建笔记'}
            </button>
            <button
              type="button"
              onClick={() => router.push(`/classes/${classId}/notes`)}
              className="btn btn-ghost"
            >
              取消
            </button>
          </div>
        </form>
      </div>
    </ClassWorkspaceShell>
  )
}