'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import MarkdownEditor from '@/components/common/MarkdownEditor'
import { ArrowLeft, Send, Save, Eye, Sparkles } from 'lucide-react'
import Link from 'next/link'
import type { Category } from '@/types/models'

export default function CreatePostPage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [tags, setTags] = useState('')
  const [categories, setCategories] = useState<{id: string, name: string}[]>([])
  const [allCategories, setAllCategories] = useState<Category[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (!data.success) {
          router.push('/login?redirect=/discuss/create')
        } else {
          setIsAdmin(!!data.data.isAdmin)
        }
      })
      .catch(() => router.push('/login?redirect=/discuss/create'))

    fetch('/api/categories')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setAllCategories(data.data)
        }
      })
      .catch(console.error)
  }, [])

  useEffect(() => {
    if (allCategories.length > 0) {
      let filtered = allCategories
      if (!isAdmin) {
        filtered = allCategories.filter((c: Category) => c.name !== '公告')
      }
      setCategories(filtered)
      
      const currentIsAnnouncement = allCategories.find(c => c.id === categoryId)?.name === '公告'
      
      if (filtered.length > 0) {
        if (!categoryId || (currentIsAnnouncement && !isAdmin)) {
          setCategoryId(filtered[0].id)
        }
      }
    }
  }, [isAdmin, allCategories])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !content.trim()) return

    setIsSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content,
          categoryId: categoryId || undefined,
          tags: tags.split(/[,，]/).map(t => t.trim()).filter(Boolean),
          status: 'published'
        })
      })

      const data = await res.json()
      if (data.success) {
        router.push(`/discuss/${data.data.id}`)
      } else {
        setError(data.error || '发布失败')
      }
    } catch (err) {
      setError('网络错误')
    } finally {
      setIsSubmitting(false)
    }
  }

  const wordCount = content.length
  const canSubmit = title.trim().length >= 2 && content.trim().length >= 10

  return (
    <div className="min-h-screen py-8">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="flex items-center justify-between mb-8">
          <Link
            href="/discuss"
            className="group flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            返回讨论区
          </Link>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted border border-border text-sm text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-secondary animate-pulse"></span>
              自动保存已开启
            </div>
          </div>
        </div>

        <div className="card-static rounded-2xl overflow-hidden">
          <div className="px-6 py-5 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center shadow-lg shadow-primary/20">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">发布新帖子</h1>
                <p className="text-sm text-muted-foreground">分享你的想法、问题或经验</p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {error && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-error/10 border border-error/20 text-error">
                <div className="w-8 h-8 rounded-lg bg-error/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-lg">⚠</span>
                </div>
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                帖子标题 <span className="text-error">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-card border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 text-foreground placeholder:text-muted-foreground transition-all"
                placeholder="输入一个吸引人的标题..."
                required
                maxLength={100}
              />
              <div className="flex justify-end mt-1">
                <span className={`text-xs ${title.length > 80 ? 'text-accent' : 'text-muted-foreground'}`}>
                  {title.length}/100
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  选择分类 <span className="text-error">*</span>
                </label>
                {categories.length > 0 ? (
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-card border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 text-foreground transition-all appearance-none cursor-pointer"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23475569'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '20px' }}
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                ) : (
                  <div className="w-full px-4 py-3 rounded-xl bg-warning/10 border border-warning/30 text-warning text-sm">
                    正在加载分类...
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  标签
                </label>
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-card border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 text-foreground placeholder:text-muted-foreground transition-all"
                  placeholder="算法, C++, 题解（用逗号分隔）"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-foreground">
                  帖子内容 <span className="text-error">*</span>
                </label>
                <span className="text-xs text-muted-foreground">
                  已输入 {wordCount} 字
                </span>
              </div>
              <MarkdownEditor
                value={content}
                onChange={setContent}
                height="450px"
                placeholder="支持 Markdown 格式，分享你的想法..."
              />
            </div>

            <div className="flex items-center justify-between pt-6 border-t border-border">
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                {!canSubmit && (
                  <span className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-warning"></span>
                    标题至少2字，内容至少10字
                  </span>
                )}
                {canSubmit && (
                  <span className="flex items-center gap-2 text-secondary-dark">
                    <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                    可以发布啦
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => window.open('/discuss', '_blank')}
                  className="px-5 py-2.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-all flex items-center gap-2"
                >
                  <Eye className="w-4 h-4" />
                  预览
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !canSubmit}
                  className={`
                    relative px-6 py-2.5 rounded-xl font-medium transition-all duration-300 flex items-center gap-2 overflow-hidden
                    ${canSubmit && !isSubmitting
                      ? 'bg-gradient-to-r from-primary to-primary-dark text-white shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5'
                      : 'bg-muted text-muted-foreground cursor-not-allowed'
                    }
                  `}
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" />
                      <span>发布中...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>发布帖子</span>
                    </>
                  )}

                  {canSubmit && !isSubmitting && (
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-shimmer"></div>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
      
      <style jsx>{`
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
      `}</style>
    </div>
  )
}
