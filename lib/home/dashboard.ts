/**
 * 登录用户首页仪表盘聚合数据
 */
import { prisma } from '@/lib/prisma'
import { listPublicContests } from '@/lib/contest/service'
import { listPublicAnnouncements, type PublicAnnouncementItem } from '@/lib/announcement/service'

const AC_STATUSES = new Set(['AC', 'ACCEPTED', 'Accepted'])

function isAccepted(status: string): boolean {
  return AC_STATUSES.has(status)
}

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function computeStreak(uniqueAcDates: string[]): number {
  if (uniqueAcDates.length === 0) return 0
  const set = new Set(uniqueAcDates)
  let streak = 0
  const cursor = startOfDay(new Date())
  for (;;) {
    const key = cursor.toISOString().split('T')[0]
    if (!set.has(key)) break
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

export interface HomeDashboardStats {
  todaySolved: number
  streak: number
  weeklyPassRate: number
  weeklyPassRateDelta: number | null
  totalSolved: number
  rating: number
  rank: string
}

export interface HomeAssignmentItem {
  id: string
  classId: string
  title: string
  className: string
  deadline: string | null
  status: '进行中' | '未开始' | '已截止'
  total: number
  submitted: number
}

export interface HomeContestItem {
  id: string
  title: string
  type: string
  startTime: string
  durationLabel: string
  participants: number
}

export interface HomeDashboardData {
  stats: HomeDashboardStats
  announcements: PublicAnnouncementItem[]
  recentAssignments: HomeAssignmentItem[]
  upcomingContests: HomeContestItem[]
}

async function computeUserStats(userId: string): Promise<HomeDashboardStats> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { rating: true, rank: true, solvedCount: true },
  })

  const now = new Date()
  const todayStart = startOfDay(now)
  const weekStart = new Date(now)
  weekStart.setDate(weekStart.getDate() - 7)
  weekStart.setHours(0, 0, 0, 0)
  const prevWeekStart = new Date(weekStart)
  prevWeekStart.setDate(prevWeekStart.getDate() - 7)

  const submissions = await prisma.submission.findMany({
    where: { userId },
    select: { problemId: true, status: true, submittedAt: true },
    orderBy: { submittedAt: 'desc' },
  })

  const acSubs = submissions.filter((s) => isAccepted(s.status))

  const todayAcProblems = new Set<string>()
  for (const s of acSubs) {
    if (new Date(s.submittedAt) >= todayStart) todayAcProblems.add(s.problemId)
  }

  const acByProblem = new Map<string, Date>()
  for (const s of acSubs) {
    if (!acByProblem.has(s.problemId)) acByProblem.set(s.problemId, new Date(s.submittedAt))
  }
  const totalSolved = acByProblem.size

  const acDates = [...acByProblem.values()].map((d) => d.toISOString().split('T')[0])
  const uniqueDates = [...new Set(acDates)]
  const streak = computeStreak(uniqueDates)

  const weekSubs = submissions.filter((s) => new Date(s.submittedAt) >= weekStart)
  const prevWeekSubs = submissions.filter((s) => {
    const t = new Date(s.submittedAt)
    return t >= prevWeekStart && t < weekStart
  })

  const weekRate =
    weekSubs.length > 0
      ? Math.round((weekSubs.filter((s) => isAccepted(s.status)).length / weekSubs.length) * 100)
      : 0
  const prevRate =
    prevWeekSubs.length > 0
      ? Math.round((prevWeekSubs.filter((s) => isAccepted(s.status)).length / prevWeekSubs.length) * 100)
      : null
  const weeklyPassRateDelta = prevRate !== null ? weekRate - prevRate : null

  return {
    todaySolved: todayAcProblems.size,
    streak,
    weeklyPassRate: weekRate,
    weeklyPassRateDelta,
    totalSolved: user?.solvedCount ?? totalSolved,
    rating: user?.rating ?? 1500,
    rank: user?.rank ?? '新手',
  }
}

function assignmentStatus(
  startTime: Date | null,
  endTime: Date | null,
  now: Date
): '进行中' | '未开始' | '已截止' {
  if (endTime && endTime < now) return '已截止'
  if (startTime && startTime > now) return '未开始'
  return '进行中'
}

async function listRecentAssignments(userId: string, limit = 6): Promise<HomeAssignmentItem[]> {
  const memberships = await prisma.classMember.findMany({
    where: { userId },
    select: { classId: true, class: { select: { id: true, name: true } } },
  })
  if (!memberships.length) return []

  const classIds = memberships.map((m) => m.classId)
  const classNameMap = new Map(memberships.map((m) => [m.classId, m.class.name]))

  const assignments = await prisma.classAssignment.findMany({
    where: { classId: { in: classIds } },
    orderBy: { endTime: 'asc' },
    take: 30,
  })

  const assignmentIds = assignments.map((a) => a.id)
  const allSubs =
    assignmentIds.length > 0
      ? await prisma.classAssignmentSubmission.findMany({
          where: { assignmentId: { in: assignmentIds }, userId },
          select: { assignmentId: true, problemId: true, score: true, status: true },
        })
      : []

  const subsByAssignment = new Map<string, typeof allSubs>()
  for (const s of allSubs) {
    const list = subsByAssignment.get(s.assignmentId) || []
    list.push(s)
    subsByAssignment.set(s.assignmentId, list)
  }

  const now = new Date()
  const items: HomeAssignmentItem[] = []

  for (const a of assignments) {
    const problemIds = a.problemIds || []
    const total = problemIds.length
    const subs = subsByAssignment.get(a.id) || []

    const solvedSet = new Set(
      subs.filter((s) => s.status === 'AC' || (s.score ?? 0) >= 100).map((s) => s.problemId)
    )
    const submittedCount = new Set(subs.map((s) => s.problemId)).size

    items.push({
      id: a.id,
      classId: a.classId,
      title: a.title,
      className: classNameMap.get(a.classId) || '班级',
      deadline: a.endTime ? new Date(a.endTime).toISOString().slice(0, 10) : null,
      status: assignmentStatus(a.startTime, a.endTime, now),
      total,
      submitted: Math.max(submittedCount, solvedSet.size),
    })
  }

  items.sort((a, b) => {
    if (a.status === '已截止' && b.status !== '已截止') return 1
    if (b.status === '已截止' && a.status !== '已截止') return -1
    return (a.deadline || '').localeCompare(b.deadline || '')
  })

  return items.slice(0, limit)
}

async function listUpcomingContests(userId: string, limit = 6): Promise<HomeContestItem[]> {
  const data = await listPublicContests({ page: 1, limit: 12, status: 'upcoming' }, userId)
  const contests = data.contests

  return (contests as any[]).slice(0, limit).map((c) => {
    const start = new Date(c.startTime)
    const end = c.endTime ? new Date(c.endTime) : null
    let durationLabel = '—'
    if (c.duration && c.duration > 0) {
      const hours = Math.round(c.duration / 60)
      durationLabel = hours >= 1 ? `${hours} 小时` : `${c.duration} 分钟`
    } else if (end) {
      const mins = Math.round((end.getTime() - start.getTime()) / 60_000)
      const hours = Math.round(mins / 60)
      durationLabel = hours >= 1 ? `${hours} 小时` : `${mins} 分钟`
    }

    return {
      id: c.id,
      title: c.title,
      type: c.type || 'OI',
      startTime: start.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
      durationLabel,
      participants: c._count?.participants ?? c.participantCount ?? 0,
    }
  })
}

export async function getHomeDashboard(userId: string): Promise<HomeDashboardData> {
  const [stats, announcements, recentAssignments, upcomingContests] = await Promise.all([
    computeUserStats(userId),
    listPublicAnnouncements(6),
    listRecentAssignments(userId, 6),
    listUpcomingContests(userId, 6),
  ])

  return {
    stats,
    announcements,
    recentAssignments,
    upcomingContests,
  }
}