'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useUser } from '@/contexts/UserContext'
import { fetchWithAuth } from '@/lib/api/base'
import { ArrowLeft, User, Calendar, Tag, Edit, Trash2, FileText, AlertCircle } from 'lucide-react'

interface Note {
  id: string
  title: string
  content: string
  category: string
  tags: string[]
  author: {
    id: string
    username: string
    nickname?: string
    avatar?: string
  }
  createdAt: string
  updatedAt: string
}

export default function NoteDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useUser()
  const [note, setNote] = useState<Note | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) {
      router.push('/login')
      return
    }
    fetchNote()
  }, [user, params.id, params.noteId])

  const fetchNote = async () => {
    try {
      setLoading(true)
      const response = await fetchWithAuth(`/api/teams/${params.id}/notes/${params.noteId}`)

      const data = await response.json()

      if (data.success) {
        setNote(data.data)
      } else {
        setError(data.error || '获取笔记失败')
      }
    } catch (err) {
      setError('获取笔记失败')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('确定要删除这篇笔记吗？此操作不可恢复！')) return

    try {
      const response = await fetchWithAuth(`/api/teams/${params.id}/notes/${params.noteId}`, {
        method: 'DELETE'
      })

      const data = await response.json()

      if (data.success) {
        alert('笔记已删除')
        router.push(`/teams/${params.id}`)
      } else {
        alert(data.error || '删除失败')
      }
    } catch (err) {
      alert('删除失败，请重试')
    }
  }

  const renderMarkdown = (text: string) => {
    let html = text
    
    html = html.replace(/^### (.*$)/gim, '<h3 class="text-xl font-bold text-foreground mt-6 mb-3">$1</h3>')
    html = html.replace(/^## (.*$)/gim, '<h2 class="text-2xl font-bold text-foreground mt-8 mb-4">$1</h2>')
    html = html.replace(/^# (.*$)/gim, '<h1 class="text-3xl font-bold text-foreground mt-10 mb-5">$1</h1>')
    
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold">$1</strong>')
    
    html = html.replace(/`([^`]+)`/g, '<code class="bg-muted px-1.5 py-0.5 rounded text-sm text-primary-light">$1</code>')
    
    html = html.replace(/```([\s\S]*?)```/g, '<pre class="bg-card border border-border p-4 rounded-lg my-4 overflow-x-auto"><code class="text-foreground">$1</code></pre>')
    
    html = html.replace(/^\- (.*$)/gim, '<li class="ml-6 list-disc text-muted-foreground">$1</li>')
    html = html.replace(/(<li class="ml-6 list-disc text-muted-foreground">.*<\/li>)/g, '<ul class="my-4">$1</ul>')
    
    html = html.replace(/\n/g, '<br />')
    
    return html
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20"></div>
            <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
          </div>
          <p className="text-muted-foreground text-lg">加载笔记中...</p>
        </div>
      </div>
    )
  }

  if (error || !note) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center card-static rounded-2xl p-12 max-w-md">
          <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-error" />
          </div>
          <p className="text-error text-lg mb-6">{error || '笔记不存在'}</p>
          <button
            onClick={() => router.push(`/teams/${params.id}`)}
            className="btn btn-primary"
          >
            返回团队
          </button>
        </div>
      </div>
    )
  }

  const isAuthor = user?.id === note.author.id

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Link
          href={`/teams/${params.id}`}
          className="flex items-center gap-2 text-muted-foreground hover:text-primary-light mb-6 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          返回团队
        </Link>

        <div className="card-static rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-border">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <h1 className="text-2xl font-bold text-foreground">{note.title}</h1>
              </div>
              {isAuthor && (
                <div className="flex gap-2">
                  <button
                    onClick={() => router.push(`/teams/${params.id}/notes/${params.noteId}/edit`)}
                    className="p-2 text-primary-light hover:bg-primary/10 rounded-lg transition-colors"
                    title="编辑"
                  >
                    <Edit className="w-5 h-5" />
                  </button>
                  <button
                    onClick={handleDelete}
                    className="p-2 text-error hover:bg-error/10 rounded-lg transition-colors"
                    title="删除"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                {note.author.avatar ? (
                  <img src={note.author.avatar} alt={note.author.username} className="w-6 h-6 rounded-full" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                    <User className="w-3 h-3 text-white" />
                  </div>
                )}
                <span className="text-foreground">{note.author.nickname || note.author.username}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span>{new Date(note.createdAt).toLocaleString('zh-CN')}</span>
              </div>
              <span className="tag">
                {note.category}
              </span>
              {note.tags.map((tag, idx) => (
                <span key={idx} className="tag tag-primary flex items-center gap-1">
                  <Tag className="w-3 h-3" />
                  {tag}
                </span>
              ))}
            </div>

            {note.updatedAt !== note.createdAt && (
              <p className="mt-2 text-xs text-muted-foreground">
                最后编辑于 {new Date(note.updatedAt).toLocaleString('zh-CN')}
              </p>
            )}
          </div>

          <div className="p-6">
            <div 
              className="prose prose-invert max-w-none text-foreground"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(note.content) }}
            />
          </div>
        </div>

        {isAuthor && (
          <div className="mt-6 p-4 glass rounded-xl border border-primary/20">
            <p className="text-sm text-primary-light">
              💡 提示：您可以编辑或删除自己创建的笔记。点击右上角的编辑按钮即可修改内容。
            </p>
          </div>
        )}

        <div className="mt-6 flex gap-3">
          {isAuthor && (
            <button
              onClick={() => router.push(`/teams/${params.id}/notes/${params.noteId}/edit`)}
              className="btn btn-primary"
            >
              编辑笔记
            </button>
          )}
          <button
            onClick={() => router.push(`/teams/${params.id}`)}
            className="btn btn-ghost"
          >
            返回团队
          </button>
        </div>
      </div>
    </div>
  )
}
