/**
 * lib/contest/validation.ts
 * 竞赛参数校验
 */
import { required, optional, toInt, toBool } from '@/lib/api/validation'
import { validateObjectId } from '@/lib/api/validation'

export function parseContestListQuery(q: Record<string, string>) {
  return {
    keyword: optional(q.keyword),
    status: optional(q.status) as 'upcoming' | 'running' | 'finished' | undefined,
    isPublic: q.isPublic ? toBool(q.isPublic) : undefined,
    page: toInt(q.page, 'page', 1),
    pageSize: toInt(q.pageSize, 'pageSize', 20),
  }
}

export function parseContestCreate(body: any) {
  return {
    title: required(body?.title, '竞赛标题'),
    description: optional(body?.description),
    type: optional(body?.type) ?? 'individual',
    startTime: new Date(required(body?.startTime, '开始时间')),
    endTime: new Date(required(body?.endTime, '结束时间')),
    isPublic: body?.isPublic ? toBool(body.isPublic) : true,
    password: optional(body?.password),
  }
}
