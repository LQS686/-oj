import { prisma } from '@/lib/prisma'
import ContestRegistration from './ContestRegistration'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import Link from 'next/link'
import { Edit, FileText } from 'lucide-react'

export default async function ContestOverviewPage({ params }: { params: Promise<{ id: string }> }) {
 const { id } = await params
 
 const contest = await prisma.contest.findUnique({
 where: { id },
 include: {
 author: { select: { id: true, username: true, nickname: true } }
 }
 })

 if (!contest) return null

 const cookieStore = await cookies()
 const token = cookieStore.get('token')?.value
 let canEdit = false
 
 if (token) {
 const payload = verifyToken(token)
 if (payload) {
 if (payload.userId === contest.authorId || payload.isAdmin) {
 const now = new Date()
 if (now < contest.startTime) {
 canEdit = true
 }
 }
 }
 }

 return (
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
 <div className="lg:col-span-2 space-y-6">
 <div className="card p-6 rounded-lg">
 <div className="flex justify-between items-start mb-4">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
 <FileText className="w-5 h-5 text-primary-light" />
 </div>
 <h2 className="text-xl font-bold text-foreground">竞赛说明</h2>
 </div>
 {canEdit && (
 <Link 
 href={`/contests/${id}/edit`}
 className="btn btn-ghost text-sm px-3 py-1.5"
 >
 <Edit className="w-4 h-4" />
 编辑竞赛
 </Link>
 )}
 </div>
 <div className="prose max-w-none whitespace-pre-wrap text-muted-foreground leading-relaxed">
 {contest.description || '暂无说明'}
 </div>
 </div>
 </div>
 <div className="space-y-6">
 <ContestRegistration contest={contest} />
 </div>
 </div>
 )
}
