'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { FileText, Plus, Calendar } from 'lucide-react'
import { useUser } from '@/contexts/UserContext'
import { ClassWorkspaceShell, PageLoading, DenseListShell, denseListRowClass } from '@/components/common'

interface Assignment {
 id: string
 title: string
 description: string
 deadline: string | null
 problemCount: number
 stats: {
 totalMembers: number
 completedMembers: number
 completionRate: number
 }
 userStatus: string
 createdAt: string
 createdBy?: string
}

export default function ClassAssignmentsPage() {
 const params = useParams()
 const { user } = useUser()
 const classId = params.id as string

 const [assignments, setAssignments] = useState<Assignment[]>([])
 const [loading, setLoading] = useState(true)
 const [filter, setFilter] = useState<'all' | 'ongoing' | 'ended'>('all')

 useEffect(() => {
 fetchAssignments()
 }, [classId])

 const fetchAssignments = async () => {
 try {
 setLoading(true)
 const response = await fetch(`/api/classes/${classId}/assignments`)
 const data = await response.json()

 if (data.success) {
 const assignmentsList = data.data?.assignments || []
 setAssignments(assignmentsList)
 } else {
 setAssignments([])
 }
 } catch (error) {
 console.error('[ClassAssignments] 获取作业列表失败:', error)
 setAssignments([])
 } finally {
 setLoading(false)
 }
 }

 const getAssignmentStatus = (assignment: Assignment) => {
 if (!assignment.deadline) return { text: '无期限', color: 'tag' }
 const now = new Date()
 const end = new Date(assignment.deadline)

 if (now > end) return { text: '已结束', color: 'tag-error' }
 return { text: '进行中', color: 'tag-success' }
 }

 const filteredAssignments = assignments.filter(assignment => {
 if (filter === 'all') return true
 if (!assignment.deadline) return filter === 'ongoing'
 const now = new Date()
 const end = new Date(assignment.deadline)
 if (filter === 'ongoing') return now <= end
 if (filter === 'ended') return now > end
 return true
 })

 if (loading) {
 return <PageLoading label="加载作业中..." />
 }

 const assignmentColumns = [
 { span: 'col-span-6 md:col-span-5', label: '作业标题' },
 { span: 'col-span-3 md:col-span-2', label: '题目数' },
 { span: 'hidden md:block md:col-span-3', label: '截止时间' },
 { span: 'col-span-3 md:col-span-2 text-center', label: '状态' },
 ]

 return (
 <ClassWorkspaceShell
 classId={classId}
 title="班级作业"
 description={`共 ${assignments.length} 个作业`}
 icon={FileText}
 iconClassName="bg-accent text-white"
 actions={
 user ? (
 <Link href={`/classes/${classId}/assignments/create`} className="btn btn-primary">
 <Plus className="w-5 h-5" />
 创建作业
 </Link>
 ) : undefined
 }
 toolbar={
 <div className="flex flex-wrap gap-2">
 <button
 type="button"
 onClick={() => setFilter('all')}
 className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
 filter === 'all' ? 'btn btn-primary' : 'bg-muted text-muted-foreground hover:bg-primary/10'
 }`}
 >
 全部作业
 </button>
 <button
 type="button"
 onClick={() => setFilter('ongoing')}
 className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
 filter === 'ongoing' ? 'btn btn-secondary' : 'bg-muted text-muted-foreground hover:bg-secondary/10'
 }`}
 >
 进行中
 </button>
 <button
 type="button"
 onClick={() => setFilter('ended')}
 className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
 filter === 'ended' ? 'bg-error text-white' : 'bg-muted text-muted-foreground hover:bg-error/10'
 }`}
 >
 已结束
 </button>
 </div>
 }
 >
 {filteredAssignments.length === 0 ? (
 <div className="card-static rounded-lg p-16 text-center">
 <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
 <FileText className="w-8 h-8 text-muted-foreground" />
 </div>
 <div className="text-foreground text-xl font-semibold mb-2">
 {filter !== 'all' ? '没有找到匹配的作业' : '还没有创建作业'}
 </div>
 <div className="text-muted-foreground mb-6">
 {filter !== 'all' ? '尝试切换其他筛选条件' : '创建第一个作业来布置任务吧'}
 </div>
 {user && filter === 'all' && (
 <Link
 href={`/classes/${classId}/assignments/create`}
 className="btn btn-primary"
 >
 <Plus className="w-5 h-5" />
 创建第一个作业
 </Link>
 )}
 </div>
 ) : (
 <DenseListShell columns={assignmentColumns}>
 {filteredAssignments.map((assignment) => (
 <AssignmentRow key={assignment.id} assignment={assignment} classId={classId} />
 ))}
 </DenseListShell>
 )}
 </ClassWorkspaceShell>
 )
}

function AssignmentRow({ assignment, classId }: { assignment: Assignment; classId: string }) {
	const getAssignmentStatus = (assignment: Assignment) => {
		if (!assignment.deadline) return { text: '无期限', color: 'tag' }
		const now = new Date()
		const end = new Date(assignment.deadline)

		if (now > end) return { text: '已结束', color: 'tag-error' }
		return { text: '进行中', color: 'tag-success' }
	}

	const status = getAssignmentStatus(assignment)
	const problemCount = assignment.problemCount || 0

	return (
		<Link
			href={`/classes/${classId}/assignments/${assignment.id}`}
			className={`${denseListRowClass} group`}
		>
			<div className="col-span-6 md:col-span-5 flex items-center">
				<div className="min-w-0">
					<div className="font-semibold text-foreground group-hover:text-primary-light transition-colors truncate">
						{assignment.title}
					</div>
					<div className="text-xs text-muted-foreground truncate">
						{assignment.description || '暂无描述'}
					</div>
				</div>
			</div>
			<div className="col-span-3 md:col-span-2 flex items-center">
				<FileText className="w-4 h-4 text-muted-foreground mr-1.5 flex-shrink-0" />
				<span className="text-sm text-foreground font-medium">{problemCount}</span>
			</div>
			<div className="hidden md:flex md:col-span-3 items-center">
				<Calendar className="w-4 h-4 text-muted-foreground mr-1.5 flex-shrink-0" />
				<span className="text-sm text-muted-foreground truncate">
					{assignment.deadline ? new Date(assignment.deadline).toLocaleString('zh-CN') : '无限制'}
				</span>
			</div>
			<div className="col-span-3 md:col-span-2 flex items-center justify-center">
				<span className={`tag ${status.color}`}>
					{status.text}
				</span>
			</div>
		</Link>
	)
}
