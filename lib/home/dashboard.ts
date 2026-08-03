/**
 * 登录用户首页仪表盘聚合数据
 */
import { prisma } from '@/lib/prisma'
import { listPublicContests } from '@/lib/contest/service'
import { listPublicAnnouncements, type PublicAnnouncementItem } from '@/lib/announcement/service'
import { SubmissionStatus } from '@/lib/constants/submission-status'

function isAccepted(status: string): boolean {
  return status === SubmissionStatus.ACCEPTED || status === 'AC'
}

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export interface HomeDashboardStats {
  todaySolved: number
  weeklyPassRate: number
  weeklyPassRateDelta: number | null
  totalSolved: number
  weeklySubmissions: number
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

  // 仅拉取近两周提交做周通过率；今日/累计 AC 用聚合，避免拉全量历史
  const [weekSubs, prevWeekSubs, todayAcGroups, distinctAc] = await Promise.all([
    prisma.submission.findMany({
      where: { userId, submittedAt: { gte: weekStart } },
      select: { status: true },
      // C-P2-9：两周窗口提交量理论上有限，仍加 take 上限防极端活跃用户拖垮内存
      take: 5000,
    }),
    prisma.submission.findMany({
      where: { userId, submittedAt: { gte: prevWeekStart, lt: weekStart } },
      select: { status: true },
      take: 5000,
    }),
    prisma.submission.groupBy({
      by: ['problemId'],
      where: {
        userId,
        status: SubmissionStatus.ACCEPTED,
        submittedAt: { gte: todayStart },
      },
    }),
    // C-P2-9：累计 AC 去重改用 groupBy（按 problemId 聚合），替代全量 distinct 拉取
    prisma.submission.groupBy({
      by: ['problemId'],
      where: { userId, status: SubmissionStatus.ACCEPTED },
    }),
  ])

  const totalSolved = distinctAc.length

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
    todaySolved: todayAcGroups.length,
    weeklyPassRate: weekRate,
    weeklyPassRateDelta,
    totalSolved: user?.solvedCount || totalSolved,
    weeklySubmissions: weekSubs.length,
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

type ContestListItem = {
  id: string
  title: string
  type: string
  startTime: Date
  endTime: Date
  duration?: number
  _count?: { participants: number }
  participantCount?: number
}

async function listUpcomingContests(userId: string, limit = 6): Promise<HomeContestItem[]> {
  const data = await listPublicContests({ page: 1, limit: 12, status: 'upcoming' }, userId)
  const contests = data.contests

  return (contests as ContestListItem[]).slice(0, limit).map((c) => {
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