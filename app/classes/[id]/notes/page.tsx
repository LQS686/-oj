'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { FileText, Plus, Calendar, User, Search } from 'lucide-react'
import { useUser } from '@/contexts/UserContext'
import { ClassWorkspaceShell, PageLoading, DenseListShell, denseListRowClass } from '@/components/common'

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

export default function ClassNotesPage() {
 const params = useParams()
 const { user } = useUser()
 const classId = params.id as string

 const [notes, setNotes] = useState<Note[]>([])
 const [loading, setLoading] = useState(true)
 const [searchQuery, setSearchQuery] = useState('')
 const [showMyNotes, setShowMyNotes] = useState(false)

 useEffect(() => {
 fetchNotes()
 }, [classId, showMyNotes])

 const fetchNotes = async () => {
 try {
 setLoading(true)
 const params = new URLSearchParams()
 if (showMyNotes && user) {
 params.append('authorId', user.id)
 }

 const response = await fetch(`/api/classes/${classId}/notes?${params}`)
 const data = await response.json()

 console.log('[ClassNotes] API响应:', data)

 if (data.success) {
 setNotes(data.data?.notes || [])
 } else {
 console.error('[ClassNotes] API错误:', data.error)
 setNotes([])
 }
 } catch (error) {
 console.error('[ClassNotes] 获取笔记列表失败:', error)
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
 return <PageLoading label="加载笔记中..." />
 }

 const noteColumns = [
 { span: 'col-span-6', label: '笔记标题' },
 { span: 'col-span-3 md:col-span-2', label: '作者' },
 { span: 'hidden md:block md:col-span-2', label: '分类' },
 { span: 'col-span-3 md:col-span-2', label: '日期' },
 ]

 return (
 <ClassWorkspaceShell
 classId={classId}
 title="班级笔记"
 description={`共 ${notes.length} 篇笔记`}
 icon={FileText}
 actions={
 user ? (
 <Link href={`/classes/${classId}/notes/create`} className="btn btn-primary">
 <Plus className="w-5 h-5" />
 创建笔记
 </Link>
 ) : undefined
 }
 toolbar={
 <div className="space-y-3">
 <div className="relative max-w-xl">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
 <input
 type="text"
 placeholder="搜索笔记标题或内容..."
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 className="input w-full pl-10 py-2"
 />
 </div>
 {user && (
 <div className="flex gap-2">
 <button
 type="button"
 onClick={() => setShowMyNotes(false)}
 className={`px-3 py-1.5 rounded-md text-sm font-medium ${
 !showMyNotes ? 'btn btn-primary' : 'bg-muted text-muted-foreground'
 }`}
 >
 全部笔记
 </button>
 <button
 type="button"
 onClick={() => setShowMyNotes(true)}
 className={`px-3 py-1.5 rounded-md text-sm font-medium ${
 showMyNotes ? 'btn btn-primary' : 'bg-muted text-muted-foreground'
 }`}
 >
 我的笔记
 </button>
 </div>
 )}
 </div>
 }
 >
 {filteredNotes.length === 0 ? (
 <div className="card-static rounded-lg p-16 text-center">
 <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
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
 href={`/classes/${classId}/notes/create`}
 className="btn btn-primary inline-flex items-center gap-2"
 >
 <Plus className="w-5 h-5" />
 创建第一篇笔记
 </Link>
 )}
 </div>
 ) : (
 <DenseListShell columns={noteColumns}>
 {filteredNotes.map((note) => (
 <NoteRow key={note.id} note={note} classId={classId} />
 ))}
 </DenseListShell>
 )}
 </ClassWorkspaceShell>
 )
}

function NoteRow({ note, classId }: { note: Note; classId: string }) {
	return (
		<Link
			href={`/classes/${classId}/notes/${note.id}`}
			className={`${denseListRowClass} group`}
		>
			<div className="col-span-6 md:col-span-6 flex items-center">
				<div className="min-w-0">
					<div className="font-semibold text-foreground group-hover:text-primary-light transition-colors truncate">
						{note.title}
					</div>
					<div className="text-xs text-muted-foreground truncate">
						{note.content.replace(/[#*`_\[\]]/g, '').substring(0, 80)}
					</div>
				</div>
			</div>
			<div className="col-span-3 md:col-span-2 flex items-center gap-1.5">
				<User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
				<span className="text-sm text-foreground truncate">
					{note.author?.nickname || note.author?.username || '匿名'}
				</span>
			</div>
			<div className="hidden md:flex md:col-span-2 items-center">
				{note.category ? (
					<span className="tag tag-primary">{note.category}</span>
				) : (
					<span className="text-sm text-muted-foreground">-</span>
				)}
			</div>
			<div className="col-span-3 md:col-span-2 flex items-center">
				<Calendar className="w-4 h-4 text-muted-foreground mr-1.5 flex-shrink-0" />
				<span className="text-sm text-muted-foreground">
					{new Date(note.createdAt).toLocaleDateString()}
				</span>
			</div>
		</Link>
	)
}
