'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { MessageSquare, ThumbsUp, Eye, Pin, Lock, PenTool, Users, TrendingUp, MessageCircle, Sparkles } from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { ActiveUser } from '@/types/models'
import { motion, easeOut } from 'framer-motion'

interface Post {
  id: string
  title: string
  content: string
  author: {
    id: string
    username: string
    nickname: string
    rating: number
    color: string
    avatar?: string
  }
  category?: {
    id: string
    name: string
  }
  tags: string[]
  views: number
  likes: number
  isPinned: boolean
  isLocked: boolean
  createdAt: string
  updatedAt: string
  _count?: {
    comments: number
  }
}

interface Category {
  id: string
  name: string
  description?: string
}

const MotionLink = motion(Link)

export default function DiscussPage() {
  const router = useRouter()
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState('all')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [hotPosts, setHotPosts] = useState<Post[]>([])
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    fetchCategories()
    fetchHotPosts()
    fetchActiveUsers()
  }, [])

  useEffect(() => {
    fetchPosts()
  }, [selectedCategoryId, page, searchQuery])

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/categories')
      const data = await res.json()
      if (data.success) {
        setCategories([{ id: 'all', name: '全部' }, ...data.data])
      }
    } catch (err) {
      console.error(err)
    }
  }

  const fetchHotPosts = async () => {
    try {
      const res = await fetch('/api/posts?sort=views&limit=5')
      const data = await res.json()
      if (data.success) {
        setHotPosts(data.data.posts)
      }
    } catch (err) {
      console.error(err)
    }
  }

  const fetchActiveUsers = async () => {
    try {
      const res = await fetch('/api/users/active?limit=5')
      const data = await res.json()
      if (data.success) {
        setActiveUsers(data.data)
      }
    } catch (err) {
      console.error(err)
    }
  }

  const fetchPosts = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const categoryParam = selectedCategoryId === 'all' ? '' : `&categoryId=${selectedCategoryId}`
      const searchParam = searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ''
      const response = await fetch(`/api/posts?page=${page}&limit=10${categoryParam}${searchParam}`)
      const data = await response.json()

      if (data.success) {
        setPosts(data.data.posts || [])
        setTotalPages(data.data.pagination?.totalPages || Math.ceil((data.data.pagination?.total || 0) / 10))
      } else {
        setError(data.error || '获取帖子列表失败')
        setPosts([])
        setTotalPages(1)
      }
    } catch (err) {
      console.error('获取帖子列表失败:', err)
      setError('网络错误，获取帖子列表失败')
      setPosts([])
    } finally {
      setLoading(false)
    }
  }

  const handleCreatePost = () => {
    router.push('/discuss/create')
  }

  if (loading && posts.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto mb-8">
            <div className="absolute inset-0 rounded-full border-3 border-primary/15"></div>
            <div className="absolute inset-0 rounded-full border-3 border-primary border-t-transparent animate-spin"></div>
          </div>
          <p className="text-muted-foreground text-xl">加载中...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <div className="w-20 h-20 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-8">
            <MessageSquare className="w-10 h-10 text-error" />
          </div>
          <div className="text-foreground text-2xl font-semibold mb-3">加载失败</div>
          <p className="text-muted-foreground mb-8 text-lg">{error}</p>
          <button 
            onClick={fetchPosts}
            className="btn btn-primary px-8 py-4 rounded-2xl"
          >
            <Sparkles className="w-5 h-5" />
            重试
          </button>
        </motion.div>
      </div>
    )
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  }

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        duration: 0.4,
        ease: easeOut
      }
    }
  }

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 mb-10">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center shadow-xl shadow-primary/25">
              <MessageCircle className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-foreground">社区</h1>
              <p className="text-muted-foreground text-sm mt-1">与大家一起交流学习、分享经验</p>
            </div>
          </div>
          <button 
            onClick={handleCreatePost}
            className="btn btn-primary px-6 py-3 rounded-2xl"
          >
            <PenTool className="w-5 h-5" />
            发布帖子
          </button>
        </div>

        <div className="grid lg:grid-cols-4 gap-7">
          <div className="lg:col-span-3 space-y-5">
            <div className="card-static rounded-3xl p-6 border border-primary/5">
              <div className="mb-5">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="搜索帖子..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value)
                      setPage(1)
                    }}
                    className="w-full px-4 py-3 rounded-xl border border-primary/10 focus:outline-none focus:ring-2 focus:ring-primary/50 bg-muted/20"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => {
                        setSearchQuery('')
                        setPage(1)
                      }}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2.5">
                {categories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => {
                      setSelectedCategoryId(category.id)
                      setPage(1)
                    }}
                    className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      selectedCategoryId === category.id
                        ? 'bg-primary text-white shadow-lg shadow-primary/25'
                        : 'bg-muted/40 text-muted-foreground hover:bg-primary/8 hover:text-primary-light'
                    }`}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            </div>

            {posts.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="card-static rounded-3xl p-20 text-center border border-primary/5"
              >
                <div className="w-20 h-20 rounded-full bg-muted/40 flex items-center justify-center mx-auto mb-8">
                  <MessageSquare className="w-10 h-10 text-muted-foreground" />
                </div>
                <div className="text-foreground text-2xl font-semibold mb-3">暂无帖子</div>
                <div className="text-muted-foreground mb-10 text-lg">当前分类下没有帖子</div>
                <button 
                  onClick={handleCreatePost}
                  className="btn btn-primary px-8 py-4 rounded-2xl"
                >
                  发布第一篇帖子
                </button>
              </motion.div>
            ) : (
              <motion.div 
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="space-y-5"
              >
                {posts.map((post) => (
                  <motion.div
                    key={post.id}
                    variants={itemVariants}
                    className="card p-7 group rounded-3xl"
                  >
                    <div className="flex gap-5">
                      <div className="flex-shrink-0">
                        <div
                          className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl font-bold overflow-hidden shadow-md"
                          style={{ backgroundColor: post.author.color || '#6366F1' }}
                        >
                          {post.author.avatar ? (
                            <img src={post.author.avatar} alt={post.author.username} className="w-full h-full rounded-2xl object-cover" />
                          ) : (
                            post.author.username?.charAt(0).toUpperCase() || '?'
                          )}
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3.5 flex-wrap">
                            <Link
                              href={`/discuss/${post.id}`}
                              className="text-xl font-bold text-foreground hover:text-primary-light transition-colors flex items-center gap-2.5"
                            >
                              {post.isPinned && <Pin className="w-5 h-5 text-primary-light" />}
                              {post.isLocked && <Lock className="w-5 h-5 text-muted-foreground" />}
                              <span className="line-clamp-1">{post.title}</span>
                            </Link>
                            {post.category && (
                              <span className="tag tag-primary text-xs px-3 py-1.5">
                                {post.category.name}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="text-muted-foreground text-sm mb-4 line-clamp-2 leading-relaxed">
                          {post.content.substring(0, 180)}...
                        </div>

                        <div className="flex items-center gap-5 text-sm text-muted-foreground mb-4">
                          <span className="font-semibold" style={{ color: post.author.color || 'var(--primary-light)' }}>
                            {post.author.nickname || post.author.username}
                          </span>
                          <span>Rating: {post.author.rating}</span>
                          <span>{new Date(post.createdAt).toLocaleString('zh-CN')}</span>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex flex-wrap gap-2">
                            {post.tags.map((tag) => (
                              <span key={tag} className="tag text-xs px-3 py-1.5">
                                {tag}
                              </span>
                            ))}
                          </div>

                          <div className="flex items-center gap-6 text-sm text-muted-foreground">
                            <span className="flex items-center gap-2">
                              <Eye className="w-4.5 h-4.5" />
                              <span className="font-medium">{post.views}</span>
                            </span>
                            <span className="flex items-center gap-2">
                              <ThumbsUp className="w-4.5 h-4.5" />
                              <span className="font-medium">{post.likes}</span>
                            </span>
                            <span className="flex items-center gap-2">
                              <MessageSquare className="w-4.5 h-4.5" />
                              <span className="font-medium">{post._count?.comments || 0}</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}

            {totalPages > 1 && (
              <div className="flex justify-center pt-6">
                <div className="flex items-center gap-2.5 glass-strong rounded-2xl p-2.5 border border-primary/5">
                  <button 
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                    className="btn btn-ghost px-4 py-3 rounded-xl disabled:opacity-50"
                  >
                    上一页
                  </button>
                  <div className="flex items-center gap-1.5">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const pageNum = i + 1
                      return (
                        <button 
                          key={pageNum}
                          onClick={() => setPage(pageNum)}
                          className={`w-11 h-11 rounded-xl font-semibold transition-all ${
                            page === pageNum
                              ? 'bg-primary text-white shadow-lg shadow-primary/25'
                              : 'text-muted-foreground hover:bg-primary/8 hover:text-primary-light'
                          }`}
                        >
                          {pageNum}
                        </button>
                      )
                    })}
                    {totalPages > 5 && (
                      <>
                        <span className="px-3 text-muted-foreground">...</span>
                        <button 
                          onClick={() => setPage(totalPages)}
                          className={`w-11 h-11 rounded-xl font-semibold transition-all ${
                            page === totalPages
                              ? 'bg-primary text-white shadow-lg shadow-primary/25'
                              : 'text-muted-foreground hover:bg-primary/8 hover:text-primary-light'
                          }`}
                        >
                          {totalPages}
                        </button>
                      </>
                    )}
                  </div>
                  <button 
                    onClick={() => setPage(page + 1)}
                    disabled={page === totalPages}
                    className="btn btn-ghost px-4 py-3 rounded-xl disabled:opacity-50"
                  >
                    下一页
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-1 space-y-7">
            <div className="card-static rounded-3xl p-7 border border-primary/5">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-primary-light" />
                </div>
                <h3 className="text-lg font-bold text-foreground">热门话题</h3>
              </div>
              <div className="space-y-4">
                {hotPosts.length === 0 ? (
                  <div className="text-muted-foreground text-sm">暂无热门话题</div>
                ) : (
                  hotPosts.map((topic, index) => (
                    <div key={topic.id} className="flex items-start gap-3.5">
                      <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                        index < 3 
                          ? 'bg-gradient-to-br from-primary to-primary-dark text-white shadow-lg shadow-primary/30' 
                          : 'bg-muted/40 text-muted-foreground'
                      }`}>
                        {index + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <Link
                          href={`/discuss/${topic.id}`}
                          className="text-sm text-foreground hover:text-primary-light transition-colors truncate block font-medium"
                        >
                          {topic.title}
                        </Link>
                        <div className="text-xs text-muted-foreground mt-1">{topic.views} 浏览</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="card-static rounded-3xl p-7 border border-secondary/5">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 rounded-xl bg-secondary/10 flex items-center justify-center">
                  <Users className="w-5 h-5 text-secondary-light" />
                </div>
                <h3 className="text-lg font-bold text-foreground">活跃作者</h3>
              </div>
              <div className="space-y-4">
                {activeUsers.length === 0 ? (
                  <div className="text-muted-foreground text-sm">暂无活跃作者</div>
                ) : (
                  activeUsers.map((user) => (
                    <Link 
                      key={user.id} 
                      href={`/user/${user.id}`}
                      className="flex items-center gap-3.5 hover:bg-primary/5 p-2.5 -mx-2.5 rounded-xl transition-colors"
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold overflow-hidden shadow-md"
                        style={{ backgroundColor: user.color || '#6366F1' }}
                      >
                        {user.avatar ? (
                          <img src={user.avatar} alt={user.username} className="w-full h-full rounded-xl object-cover" />
                        ) : (
                          user.username?.charAt(0).toUpperCase() || '?'
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-foreground truncate">
                          {user.nickname || user.username}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {user._count?.posts || 0} 篇文章 · {user._count?.comments || 0} 评论
                        </div>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
