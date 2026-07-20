'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useUser } from '@/contexts/UserContext'
import { fetchWithCookie } from '@/lib/api/base'
import MarkdownRenderer from '@/components/common/MarkdownRenderer'
import { ArrowLeft, User, Calendar, Tag, Edit, Trash2, FileText, AlertCircle } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

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
 const response = await fetchWithCookie(`/api/classes/${params.id}/notes/${params.noteId}`)

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
 const response = await fetchWithCookie(`/api/classes/${params.id}/notes/${params.noteId}`, {
 method: 'DELETE'
 })

 const data = await response.json()

 if (data.success) {
 alert('笔记已删除')
 router.push(`/classes/${params.id}`)
 } else {
 alert(data.error || '删除失败')
 }
 } catch (err) {
 alert('删除失败，请重试')
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
 <p className="text-muted-foreground text-lg">加载笔记中...</p>
 </div>
 </div>
 )
 }

 if (error || !note) {
 return (
 <div className="min-h-screen flex items-center justify-center">
 <div className="text-center card-static rounded-lg p-12 max-w-md">
 <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-6">
 <AlertCircle className="w-8 h-8 text-error" />
 </div>
 <p className="text-error text-lg mb-6">{error || '笔记不存在'}</p>
 <button
 onClick={() => router.push(`/classes/${params.id}`)}
 className="btn btn-primary"
 >
 返回班级
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
 href={`/classes/${params.id}`}
 className="flex items-center gap-2 text-muted-foreground hover:text-primary-light mb-6 transition-colors group"
 >
 <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
 返回班级
 </Link>

 <div className="card-static rounded-lg overflow-hidden">
 <div className="p-6 border-b border-border">
 <div className="flex items-start justify-between mb-4">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
 <FileText className="w-5 h-5 text-white" />
 </div>
 <h1 className="text-2xl font-bold text-foreground">{note.title}</h1>
 </div>
 {isAuthor && (
 <div className="flex gap-2">
 <button
 onClick={() => router.push(`/classes/${params.id}/notes/${params.noteId}/edit`)}
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
 <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
 <User className="w-3 h-3 text-white" />
 </div>
 )}
 <span className="text-foreground">{note.author.nickname || note.author.username}</span>
 </div>
 <div className="flex items-center gap-2">
 <Calendar className="w-4 h-4" />
 <span>{formatDateTime(note.createdAt)}</span>
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
 最后编辑于 {formatDateTime(note.updatedAt)}
 </p>
 )}
 </div>

 <div className="p-6">
 <div className="prose prose-invert max-w-none text-foreground">
 <MarkdownRenderer content={note.content} />
 </div>
 </div>
 </div>

 {isAuthor && (
 <div className="mt-6 p-4 card-static rounded-xl border border-primary/20">
 <p className="text-sm text-primary-light">
 💡 提示：您可以编辑或删除自己创建的笔记。点击右上角的编辑按钮即可修改内容。
 </p>
 </div>
 )}

 <div className="mt-6 flex gap-3">
 {isAuthor && (
 <button
 onClick={() => router.push(`/classes/${params.id}/notes/${params.noteId}/edit`)}
 className="btn btn-primary"
 >
 编辑笔记
 </button>
 )}
 <button
 onClick={() => router.push(`/classes/${params.id}`)}
 className="btn btn-ghost"
 >
 返回班级
 </button>
 </div>
 </div>
 </div>
 )
}
