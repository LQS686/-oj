'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { FileText, Plus, Calendar, User, Search, ArrowLeft } from 'lucide-react'
import { useUser } from '@/contexts/UserContext'

interface Note {
  id: string
  title: string
  content: string
  category?: string
  tags?: string[]
  author: {
    id?: string
    username?: string
    nickname?: string
    avatar?: string
  }
  createdAt: string
  updatedAt: string
}

export default function TeamNotesPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useUser()
  const teamId = params.id as string

  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showMyNotes, setShowMyNotes] = useState(false)

  useEffect(() => {
    fetchNotes()
  }, [teamId, showMyNotes])

  const fetchNotes = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (showMyNotes && user) {
        params.append('authorId', user.id)
      }

      const response = await fetch(`/api/teams/${teamId}/notes?${params}`)
      const data = await response.json()

      console.log('[TeamNotes] API响应:', data)

      if (data.success) {
        setNotes(data.data?.notes || [])
      } else {
        console.error('[TeamNotes] API错误:', data.error)
        setNotes([])
      }
    } catch (error) {
      console.error('[TeamNotes] 获取笔记列表失败:', error)
      setNotes([])
    } finally {
      setLoading(false)
    }
  }

  const filteredNotes = notes.filter(note =>
    note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    note.content.toLowerCase().includes(searchQuery.toLowerCase())
  )

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

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-2 text-sm mb-6">
          <Link
            href={`/teams/${teamId}`}
            className="text-muted-foreground hover:text-primary-light transition-colors flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" />
            团队详情
          </Link>
          <span className="text-muted-foreground/50">/</span>
          <span className="text-foreground font-medium">团队笔记</span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center shadow-lg shadow-primary/30">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">团队笔记</h1>
              <p className="text-muted-foreground text-sm">共 {notes.length} 篇笔记</p>
            </div>
          </div>
          {user && (
            <Link
              href={`/teams/${teamId}/notes/create`}
              className="btn btn-primary flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              创建笔记
            </Link>
          )}
        </div>

        <div className="card-static rounded-2xl p-6 mb-6">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
              <input
                type="text"
                placeholder="搜索笔记标题或内容..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input pl-12 py-3"
              />
            </div>
          </div>

          {user && (
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowMyNotes(false)}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  !showMyNotes
                    ? 'bg-primary text-white'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                }`}
              >
                全部笔记
              </button>
              <button
                onClick={() => setShowMyNotes(true)}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  showMyNotes
                    ? 'bg-primary text-white'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                }`}
              >
                我的笔记
              </button>
            </div>
          )}
        </div>

        {filteredNotes.length === 0 ? (
          <div className="card-static rounded-2xl p-16 text-center">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-6">
              <FileText className="w-8 h-8 text-muted-foreground" />
            </div>
            <div className="text-foreground text-xl font-semibold mb-2">
              {searchQuery || showMyNotes ? '没有找到匹配的笔记' : '还没有创建笔记'}
            </div>
            <div className="text-muted-foreground mb-6">
              {searchQuery || showMyNotes ? '尝试其他搜索条件' : '创建第一篇笔记记录学习心得'}
            </div>
            {user && !searchQuery && !showMyNotes && (
              <Link
                href={`/teams/${teamId}/notes/create`}
                className="btn btn-primary inline-flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                创建第一篇笔记
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredNotes.map((note) => (
              <NoteCard key={note.id} note={note} teamId={teamId} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function NoteCard({ note, teamId }: { note: Note; teamId: string }) {
  const getContentPreview = (content: string) => {
    return content
      .replace(/[#*`_\[\]]/g, '')
      .substring(0, 100)
  }

  return (
    <Link
      href={`/teams/${teamId}/notes/${note.id}`}
      className="card p-6 hover:bg-muted/50 transition-all group border border-transparent hover:border-primary/20"
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-bold text-lg text-foreground flex-1 line-clamp-2 group-hover:text-primary-light transition-colors">
          {note.title}
        </h3>
        {note.category && (
          <span className="tag tag-primary ml-2 shrink-0">
            {note.category}
          </span>
        )}
      </div>

      <p className="text-muted-foreground text-sm line-clamp-3 mb-4">
        {getContentPreview(note.content)}
      </p>

      <div className="flex items-center justify-between text-sm text-muted-foreground border-t border-border pt-3">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4" />
          <span>{note.author?.nickname || note.author?.username || '匿名'}</span>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          <span>{new Date(note.createdAt).toLocaleDateString()}</span>
        </div>
      </div>
    </Link>
  )
}
