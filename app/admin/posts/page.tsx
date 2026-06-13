'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import { fetchWithAuth } from '@/lib/api/base'
import { MessageSquare, Search, User, Calendar, Eye, EyeOff, Trash2, MessageCircle } from 'lucide-react'

interface Post {
  id: string
  title: string
  content: string
  isPublished: boolean
  createdAt: string
  author: { username: string }
  _count?: {
    comments: number
  }
}

export default function AdminPostsPage() {
  const router = useRouter()
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  const fetchPosts = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetchWithAuth('/api/admin/posts')

      if (response.status === 403) {
        setError('需要管理员权限')
        setTimeout(() => router.push('/'), 2000)
        return
      }

      const data = await response.json()
      if (data.success) {
        setPosts(Array.isArray(data.data) ? data.data : [])
      } else {
        setError(data.error || '获取帖子列表失败')
        setPosts([])
      }
    } catch {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    fetchPosts()
  }, [fetchPosts])

  const handleTogglePublish = async (postId: string, currentStatus: boolean) => {
    try {
      const response = await fetchWithAuth(`/api/admin/posts/${postId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublished: !currentStatus })
      })

      const data = await response.json()
      if (data.success) {
        fetchPosts()
      } else {
        alert(data.error || '操作失败')
      }
    } catch {
      alert('网络错误')
    }
  }

  const handleDeletePost = async () => {
    if (!selectedPost) return

    try {
      const response = await fetchWithAuth(`/api/admin/posts/${selectedPost.id}`, {
        method: 'DELETE'
      })

      const data = await response.json()
      if (data.success) {
        setShowDeleteModal(false)
        setSelectedPost(null)
        fetchPosts()
      } else {
        alert(data.error || '删除失败')
      }
    } catch {
      alert('网络错误')
    }
  }

  const filteredPosts = posts.filter(post => {
    return post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
           post.content.toLowerCase().includes(searchQuery.toLowerCase())
  })

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
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)' }}>
            <MessageSquare className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">帖子管理</h1>
            <p className="text-sm text-muted-foreground">管理社区帖子和评论</p>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex gap-4 flex-wrap items-center">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="搜索帖子标题或内容..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input pl-10"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card p-4">
            <div className="text-muted-foreground text-sm">总帖子数</div>
            <div className="text-2xl font-bold text-foreground mt-1">{posts.length}</div>
          </div>
          <div className="card p-4">
            <div className="text-muted-foreground text-sm">已发布</div>
            <div className="text-2xl font-bold text-secondary mt-1">
              {posts.filter(p => p.isPublished).length}
            </div>
          </div>
          <div className="card p-4">
            <div className="text-muted-foreground text-sm">草稿</div>
            <div className="text-2xl font-bold text-accent mt-1">
              {posts.filter(p => !p.isPublished).length}
            </div>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    帖子
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    作者
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    状态
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    评论
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    发布时间
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredPosts.map((post) => (
                  <tr key={post.id} className="hover:bg-muted transition-colors">
                    <td className="px-6 py-4">
                      <div className="max-w-xs">
                        <p className="text-foreground font-medium truncate">{post.title}</p>
                        <p className="text-sm text-muted-foreground truncate">{post.content.slice(0, 50)}...</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-muted-foreground" />
                        <span className="text-muted-foreground">{post.author.username}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`tag ${post.isPublished ? 'tag-success' : 'tag-warning'}`}>
                        {post.isPublished ? '已发布' : '草稿'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <MessageCircle className="w-4 h-4" />
                        <span>{post._count?.comments || 0}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="w-4 h-4" />
                        <span className="text-sm">
                          {new Date(post.createdAt).toLocaleDateString('zh-CN')}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleTogglePublish(post.id, post.isPublished)}
                          className={`p-2 rounded-lg transition-colors ${
                            post.isPublished 
                              ? 'text-secondary hover:bg-secondary/10' 
                              : 'text-accent hover:bg-accent/10'
                          }`}
                          title={post.isPublished ? '取消发布' : '发布'}
                        >
                          {post.isPublished ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => {
                            setSelectedPost(post)
                            setShowDeleteModal(true)
                          }}
                          className="p-2 text-error hover:bg-error/10 rounded-lg transition-colors"
                          title="删除"
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

          {filteredPosts.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              {searchQuery ? '没有找到匹配的帖子' : '暂无帖子'}
            </div>
          )}
        </div>
      </div>

      {showDeleteModal && selectedPost && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="card p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-foreground mb-4">确认删除</h3>
            <p className="text-muted-foreground mb-6">
              确定要删除帖子 <span className="text-foreground font-medium">{selectedPost.title}</span> 吗？
              此操作无法撤销。
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowDeleteModal(false)
                  setSelectedPost(null)
                }}
                className="btn btn-ghost"
              >
                取消
              </button>
              <button
                onClick={handleDeletePost}
                className="btn btn-destructive"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
