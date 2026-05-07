'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useUser } from '@/contexts/UserContext'
import { fetchWithAuth } from '@/lib/api/base'
import { 
  MessageSquare, 
  ArrowLeft, 
  Clock, 
  User, 
  Send,
  AlertCircle,
  Heart,
  MessageCircle,
  Eye
} from 'lucide-react'

interface Post {
  id: string
  title: string
  content: string
  author: {
    id: string
    username: string
    nickname: string
    avatar: string | null
    rating?: number
    color?: string
  }
  category: {
    id: string
    name: string
  }
  tags: string[]
  views: number
  likes: number
  isLiked: boolean
  _count: {
    comments: number
    postLikes: number
  }
  createdAt: string
}

interface Comment {
  id: string
  content: string
  author: {
    id: string
    username: string
    nickname: string
    avatar: string | null
    rating?: number
    color?: string
  }
  createdAt: string
  parentId?: string | null
  parent?: {
    author: {
      username: string
      nickname: string
    }
  }
}

export default function PostDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useUser()
  const [post, setPost] = useState<Post | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [liking, setLiking] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [replyContent, setReplyContent] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchPost()
  }, [params.id])

  const fetchPost = async () => {
    try {
      setLoading(true)
      const postResponse = await fetch(`/api/posts/${params.id}`)
      const postData = await postResponse.json()

      if (postData.success) {
        const postDetail = postData.data.post || postData.data
        setPost(postDetail)
        setComments(postData.data.comments || [])
      } else {
        setError(postData.error || '获取帖子失败')
      }
    } catch (err) {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitReply = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) {
      router.push('/login')
      return
    }
    if (!replyContent.trim()) return

    try {
      setSubmitting(true)
      
      const response = await fetchWithAuth(`/api/posts/${params.id}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: replyContent })
      })

      const data = await response.json()

      if (data.success) {
        setComments(prev => [...prev, data.data])
        setReplyContent('')
      } else {
        alert(data.error || '回复失败')
      }
    } catch (err) {
      alert('网络错误')
    } finally {
      setSubmitting(false)
    }
  }

  const handleLike = async () => {
    if (!user) {
      router.push('/login')
      return
    }
    if (liking || !post) return

    try {
      setLiking(true)
      
      const response = await fetchWithAuth(`/api/posts/${post.id}/like`, {
        method: 'POST',
      })

      const data = await response.json()

      if (data.success) {
        setPost(prev => prev ? {
          ...prev,
          isLiked: data.data.isLiked,
          likes: data.data.isLiked ? prev.likes + 1 : prev.likes - 1
        } : null)
      } else {
        alert(data.error || '操作失败')
      }
    } catch (err) {
      alert('网络错误')
    } finally {
      setLiking(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20"></div>
            <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
          </div>
          <p className="text-muted-foreground text-lg">加载帖子中...</p>
        </div>
      </div>
    )
  }

  if (error || !post) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center card-static rounded-2xl p-12 max-w-md">
          <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-error" />
          </div>
          <p className="text-error text-lg mb-6">{error || '帖子不存在'}</p>
          <button
            onClick={() => router.push('/discuss')}
            className="btn-primary btn"
          >
            返回社区
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8">
        <button
          onClick={() => router.push('/discuss')}
          className="flex items-center gap-2 text-muted-foreground hover:text-primary-light mb-6 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          返回社区
        </button>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="card-static rounded-2xl p-6">
              <div className="flex items-start gap-4 mb-6">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center shadow-lg shadow-primary/30">
                  <MessageSquare className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h1 className="text-xl font-bold text-foreground mb-2">{post.title}</h1>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <Link href={`/user/${post.author.id}`} className="flex items-center gap-2 hover:text-primary-light transition-colors">
                      {post.author.avatar ? (
                        <img src={post.author.avatar} alt="" className="w-5 h-5 rounded-full" />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                          <User className="w-3 h-3 text-primary-light" />
                        </div>
                      )}
                      <span>{post.author.nickname || post.author.username}</span>
                    </Link>
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {new Date(post.createdAt).toLocaleString('zh-CN')}
                    </span>
                  </div>
                </div>
              </div>

              <div className="prose prose-invert prose-slate max-w-none mb-6">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code({ node, inline, className, children, ...props }: any) {
                      const match = /language-(\w+)/.exec(className || '')
                      return !inline && match ? (
                        <SyntaxHighlighter
                          style={vscDarkPlus}
                          language={match[1]}
                          PreTag="div"
                          className="rounded-lg"
                          {...props}
                        >
                          {String(children).replace(/\n$/, '')}
                        </SyntaxHighlighter>
                      ) : (
                        <code className="bg-slate-700 px-1.5 py-0.5 rounded text-pink-400" {...props}>
                          {children}
                        </code>
                      )
                    },
                    blockquote({ children }) {
                      return <blockquote className="border-l-4 border-primary pl-4 italic text-slate-400">{children}</blockquote>
                    },
                  }}
                >
                  {post.content || ''}
                </ReactMarkdown>
              </div>

              <div className="flex items-center gap-4 pt-4 border-t border-border">
                <span className="tag tag-primary">{post.category?.name || '未分类'}</span>
                {post.tags?.map((tag) => (
                  <span key={tag} className="tag">{tag}</span>
                ))}
                <div className="flex items-center gap-4 ml-auto text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Eye className="w-4 h-4" />
                    {post.views}
                  </span>
                  <button
                    onClick={handleLike}
                    disabled={liking}
                    className={`flex items-center gap-1 transition-colors ${
                      post.isLiked 
                        ? 'text-error hover:text-error' 
                        : 'text-muted-foreground hover:text-error'
                    } ${liking ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <Heart className={`w-4 h-4 ${post.isLiked ? 'fill-current' : ''}`} />
                    {post.likes}
                  </button>
                  <span className="flex items-center gap-1">
                    <MessageCircle className="w-4 h-4" />
                    {post._count?.comments || 0}
                  </span>
                </div>
              </div>
            </div>

            <div className="card-static rounded-2xl p-6">
              <h2 className="text-lg font-semibold text-foreground mb-6 flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-primary-light" />
                回复 ({comments.length})
              </h2>

              {comments.length > 0 ? (
                <div className="space-y-4">
                  {comments.map((comment) => (
                    <div key={comment.id} className="p-4 rounded-xl bg-muted/30 border border-border/50">
                      <div className="flex items-center gap-3 mb-3">
                        <Link href={`/user/${comment.author.id}`} className="flex items-center gap-2 hover:text-primary-light transition-colors">
                          {comment.author.avatar ? (
                            <img src={comment.author.avatar} alt="" className="w-8 h-8 rounded-full" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                              <User className="w-4 h-4 text-primary-light" />
                            </div>
                          )}
                          <span className="font-medium text-foreground">{comment.author.nickname || comment.author.username}</span>
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          {new Date(comment.createdAt).toLocaleString('zh-CN')}
                        </span>
                      </div>
                      <div className="text-foreground whitespace-pre-wrap">{comment.content}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  暂无回复，快来抢沙发吧！
                </div>
              )}
            </div>

            {user ? (
              <div className="card-static rounded-2xl p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">发表回复</h3>
                <form onSubmit={handleSubmitReply}>
                  <textarea
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    placeholder="写下你的回复..."
                    className="input min-h-[120px] resize-none mb-4"
                    rows={4}
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={submitting || !replyContent.trim()}
                      className="btn-primary btn"
                    >
                      {submitting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          发送中...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          发送回复
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="card-static rounded-2xl p-6 text-center">
                <p className="text-muted-foreground mb-4">登录后才能回复</p>
                <Link href="/login" className="btn-primary btn">
                  去登录
                </Link>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="card-static rounded-2xl p-6">
              <h3 className="font-semibold text-foreground mb-4">作者信息</h3>
              <Link 
                href={`/user/${post.author.id}`}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-primary/5 transition-colors"
              >
                {post.author.avatar ? (
                  <img src={post.author.avatar} alt="" className="w-12 h-12 rounded-full" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-bold">
                    {post.author.username?.charAt(0).toUpperCase() || '?'}
                  </div>
                )}
                <div>
                  <div className="font-medium text-foreground">{post.author.nickname || post.author.username}</div>
                  <div className="text-sm text-muted-foreground">查看主页</div>
                </div>
              </Link>
            </div>

            <div className="card-static rounded-2xl p-6">
              <h3 className="font-semibold text-foreground mb-4">帖子信息</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">分类</span>
                  <span className="text-foreground">{post.category?.name || '未分类'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">浏览量</span>
                  <span className="text-foreground">{post.views}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">点赞数</span>
                  <span className="text-foreground">{post.likes}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">回复数</span>
                  <span className="text-foreground">{post._count?.comments || 0}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
