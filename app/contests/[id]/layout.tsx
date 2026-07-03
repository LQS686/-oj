import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import ContestHeaderShell from './ContestHeaderShell'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { formatPageDocumentTitle } from '@/lib/page-titles'
import type { Metadata } from 'next'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const contest = await prisma.contest.findUnique({
    where: { id },
    select: { title: true },
  })
  return {
    title: formatPageDocumentTitle(contest?.title?.trim() || '竞赛详情'),
  }
}

export default async function ContestLayout({
 children,
 params
}: {
 children: React.ReactNode
 params: Promise<{ id: string }>
}) {
 const { id } = await params
 
 const contest = await prisma.contest.findUnique({
 where: { id },
 select: {
 id: true,
 title: true,
 startTime: true,
 endTime: true,
 type: true,
 isPublic: true // Add isPublic
 }
 })

 if (!contest) {
 notFound()
 }

 // Permission check
 let canViewDetails = false
 const now = new Date()
 const isEnded = now > contest.endTime
 const isStarted = now >= contest.startTime
 
 const cookieStore = await cookies()
 const token = cookieStore.get('token')?.value
 let user = null
 if (token) {
 user = verifyToken(token)
 }

 if (user && user.role === 'SYSTEM_ADMIN') {
 canViewDetails = true
 } else {
 // 1. Not Started -> False (Already default)
 
 // 2. Ended & Public & LoggedIn -> True
 if (isEnded && contest.isPublic && user) {
 canViewDetails = true
 }
 // 3. Registered & Started -> True
 else if (user) {
 const participant = await prisma.contestParticipant.findUnique({
 where: {
 contestId_userId: {
 contestId: id,
 userId: user.userId
 }
 }
 })
 if (participant && isStarted) {
 canViewDetails = true
 }
 }
 }

 return (
 <ContestHeaderShell contest={contest} canViewDetails={canViewDetails}>
 {children}
 </ContestHeaderShell>
 )
}
