import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import ContestHeaderShell from './ContestHeaderShell'
import { resolveViewerFromCookies } from '@/lib/api/withApi'
import { canAccessAdmin } from '@/lib/permissions'
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
    select: { title: true, isPublic: true, authorId: true },
  })
  if (!contest) {
    return { title: formatPageDocumentTitle('竞赛详情') }
  }
  if (!contest.isPublic) {
    const viewer = await resolveViewerFromCookies()
    const isAuthor = !!viewer && viewer.id === contest.authorId
    const isAdmin = canAccessAdmin(viewer)
    let isRegistered = false
    if (viewer && !isAuthor && !isAdmin) {
      const p = await prisma.contestParticipant.findUnique({
        where: { contestId_userId: { contestId: id, userId: viewer.id } },
        select: { id: true },
      })
      isRegistered = !!p
    }
    if (!isAuthor && !isAdmin && !isRegistered) {
      return { title: formatPageDocumentTitle('竞赛详情') }
    }
  }
  return {
    title: formatPageDocumentTitle(contest.title?.trim() || '竞赛详情'),
  }
}

export default async function ContestLayout({
  children,
  params,
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
      isPublic: true,
      authorId: true,
    },
  })

  if (!contest) {
    notFound()
  }

  const viewer = await resolveViewerFromCookies()
  const now = new Date()
  const isEnded = now > contest.endTime
  const isStarted = now >= contest.startTime

  let isRegistered = false
  if (viewer) {
    const participant = await prisma.contestParticipant.findUnique({
      where: {
        contestId_userId: {
          contestId: id,
          userId: viewer.id,
        },
      },
      select: { id: true },
    })
    isRegistered = !!participant
  }

  // 非公开竞赛：仅作者 / 管理员 / 已报名可见（与 API 一致）
  if (!contest.isPublic) {
    const isAuthor = !!viewer && viewer.id === contest.authorId
    const isAdmin = canAccessAdmin(viewer)
    if (!isAuthor && !isAdmin && !isRegistered) {
      notFound()
    }
  }

  let canViewDetails = false
  if (viewer && canAccessAdmin(viewer)) {
    canViewDetails = true
  } else if (viewer && viewer.id === contest.authorId) {
    canViewDetails = true
  } else if (isEnded && contest.isPublic && viewer) {
    canViewDetails = true
  } else if (viewer && isRegistered && isStarted) {
    canViewDetails = true
  }

  const shellContest = {
    id: contest.id,
    title: contest.title,
    startTime: contest.startTime,
    endTime: contest.endTime,
    type: contest.type,
  }

  return (
    <ContestHeaderShell contest={shellContest} canViewDetails={canViewDetails}>
      {children}
    </ContestHeaderShell>
  )
}
