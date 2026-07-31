import { notFound } from 'next/navigation'
import ContestRegistration from './ContestRegistration'
import { resolveViewerFromCookies } from '@/lib/api/withApi'
import { getContestDetailWithRegistration } from '@/lib/contest/service'
import { canManageContent } from '@/lib/permissions'
import Link from 'next/link'
import {
  Edit,
  Users,
  User as UserIcon,
  Clock,
  Lock,
  Globe,
  FileCode,
  Calendar,
} from 'lucide-react'
import { formatDateTimeShort, formatDurationMinutes } from '@/lib/utils'
import {
  EntityDescriptionCard,
  EntityInfoCard,
  EntityOverviewLayout,
} from '@/components/entity'

export default async function ContestOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const viewer = await resolveViewerFromCookies()
  const contest = await getContestDetailWithRegistration(
    id,
    viewer ? { id: viewer.id, role: viewer.role } : null
  )

  if (!contest) notFound()

  let canEdit = false
  if (viewer) {
    if (viewer.id === contest.authorId || canManageContent(viewer)) {
      const now = new Date()
      if (now < contest.startTime) {
        canEdit = true
      }
    }
  }

  const startMs = contest.startTime.getTime()
  const endMs = contest.endTime.getTime()
  const durationMinutes =
    contest.duration > 0
      ? contest.duration
      : endMs > startMs
        ? Math.round((endMs - startMs) / 60000)
        : 0

  const authorName = contest.author?.nickname || contest.author?.username || '—'
  const needsPassword = !!contest.hasPassword

  const registrationContest = {
    id: contest.id,
    title: contest.title,
    type: contest.type,
    startTime: contest.startTime,
    endTime: contest.endTime,
    isPublic: contest.isPublic,
    hasPassword: needsPassword,
  }

  const infoItems = [
    {
      icon: Calendar,
      label: '起止时间',
      value: `${formatDateTimeShort(contest.startTime)} — ${formatDateTimeShort(contest.endTime)}`,
    },
    {
      icon: Clock,
      label: '比赛时长',
      value: formatDurationMinutes(durationMinutes),
    },
    {
      icon: FileCode,
      label: '题目数量',
      value: `${contest._count.problems} 题`,
    },
    {
      icon: Users,
      label: '报名人数',
      value: `${contest._count.participants} 人`,
    },
    {
      icon: UserIcon,
      label: '主办',
      value: authorName,
    },
    {
      icon: needsPassword ? Lock : Globe,
      label: '可见性',
      value: needsPassword ? '需密码报名' : contest.isPublic ? '公开赛' : '私有赛',
    },
  ]

  return (
    <EntityOverviewLayout
      main={
        <EntityDescriptionCard
          title="竞赛说明"
          content={contest.description}
          emptyTitle="暂无竞赛说明"
          emptyHint={
            canEdit
              ? '可点击说明卡片右上角「编辑」，补充赛制规则与注意事项'
              : '主办方尚未填写说明，请关注开赛时间与报名入口'
          }
          headerAction={
            canEdit ? (
              <Link href={`/contests/${id}/edit`} className="btn btn-ghost btn-sm shrink-0">
                <Edit className="w-3.5 h-3.5" />
                编辑
              </Link>
            ) : undefined
          }
        />
      }
      aside={
        <>
          <ContestRegistration contest={registrationContest} />
          <EntityInfoCard title="竞赛信息" items={infoItems} />
        </>
      }
    />
  )
}
