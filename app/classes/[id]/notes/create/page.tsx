'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useUser } from '@/contexts/UserContext'
import { fetchWithAuth } from '@/lib/api/base'
import { FileText, Tag, AlertCircle, ArrowLeft } from 'lucide-react'

export default function CreateNotePage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useUser()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [formData, setFormData] = useState({
    title: '',
    content: '',
    category: 'General',
    tags: ''
  })

  const categories = [
    'General',
    '算法',
    '数据结构',
    '动态规划',
    '图论',
    '字符串',
    '数学',
    '其他'
  ]

  useEffect(() => {
    if (!user) {
      router.push('/login')
      return
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

      const response = await fetchWithAuth(`/api/classes/${params.id}/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: formData.title,
          content: formData.content,
          category: formData.category,
          tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean)
        })
      })

      const data = await response.json()

      if (data.success) {
        setSuccess('笔记创建成功')
        setTimeout(() => {
          router.push(`/classes/${params.id}`)
        }, 1500)
      } else {
        setError(data.error || '创建失败')
      }
    } catch (err) {
      setError('创建失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          返回
        </button>

        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white">创建班级笔记</h1>
          <p className="mt-1 text-gray-400">分享学习心得和解题思路</p>
        </div>

        <div className="card">
          <div className="p-6">
            <form onSubmit={handleSubmit}>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    笔记标题 <span className="text-red-400">*</span>
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
                  <p className="mt-1 text-sm text-gray-500">
                    {formData.title.length}/100
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      分类
                    </label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="input w-full"
                    >
                      {categories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      标签
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={formData.tags}
                        onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                        placeholder="多个标签用逗号分隔"
                        className="input w-full pr-10"
                      />
                      <Tag className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500 pointer-events-none" />
                    </div>
                    <p className="mt-1 text-sm text-gray-500">
                      例如：贪心算法,基础题
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    笔记内容 <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    placeholder="支持Markdown格式&#10;&#10;## 标题&#10;- 列表项&#10;**加粗文本**&#10;`代码`&#10;```&#10;代码块&#10;```"
                    rows={16}
                    className="input w-full font-mono text-sm"
                    required
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    支持Markdown格式，{formData.content.length} 字符
                  </p>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <FileText className="w-5 h-5 text-gray-400 mt-0.5" />
                    <div className="text-sm text-gray-300">
                      <p className="font-medium mb-2">Markdown 语法提示</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <p><code className="bg-white/10 px-1 rounded text-indigo-400"># 标题</code> - 一级标题</p>
                          <p><code className="bg-white/10 px-1 rounded text-indigo-400">## 标题</code> - 二级标题</p>
                          <p><code className="bg-white/10 px-1 rounded text-indigo-400">**粗体**</code> - 加粗文本</p>
                        </div>
                        <div className="space-y-1">
                          <p><code className="bg-white/10 px-1 rounded text-indigo-400">- 项目</code> - 无序列表</p>
                          <p><code className="bg-white/10 px-1 rounded text-indigo-400">`代码`</code> - 行内代码</p>
                          <p><code className="bg-white/10 px-1 rounded text-indigo-400">```代码块```</code> - 代码块</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-indigo-400 mt-0.5" />
                    <div className="text-sm text-indigo-300">
                      <p className="font-medium mb-1">温馨提示</p>
                      <ul className="list-disc list-inside space-y-1">
                        <li>笔记创建后，所有班级成员都可以查看</li>
                        <li>只有笔记作者可以编辑和删除笔记</li>
                        <li>建议使用清晰的标题和适当的标签，方便他人搜索</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="p-4 bg-error/100/10 border border-red-500/20 rounded-lg">
                    <p className="text-sm text-red-400">{error}</p>
                  </div>
                )}

                {success && (
                  <div className="p-4 bg-secondary/100/10 border border-green-500/20 rounded-lg">
                    <p className="text-sm text-green-400">{success}</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={loading}
                    className="btn-primary flex-1"
                  >
                    {loading ? '创建中...' : '创建笔记'}
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push(`/classes/${params.id}`)}
                    className="px-6 py-2 bg-white/10 text-gray-300 rounded-lg hover:bg-white/20 font-medium transition-colors"
                  >
                    取消
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
