/**
 * lib/contest/validation.ts
 * 竞赛参数校验
 */
import { required, optional, toInt, toBool, asRecord } from '@/lib/api/validation'

export function parseContestListQuery(q: Record<string, string>) {
  return {
    keyword: optional(q.keyword),
    status: optional(q.status) as 'upcoming' | 'running' | 'finished' | undefined,
    isPublic: q.isPublic ? toBool(q.isPublic) : undefined,
    page: toInt(q.page, 'page', 1),
    pageSize: toInt(q.pageSize, 'pageSize', 20),
  }
}

export function parseContestCreate(body: unknown) {
  const b = asRecord(body)
  return {
    title: required(b.title, '竞赛标题'),
    description: optional(b.description),
    type: optional(b.type) ?? 'individual',
    startTime: new Date(required(b.startTime, '开始时间')),
    endTime: new Date(required(b.endTime, '结束时间')),
    isPublic: b.isPublic ? toBool(b.isPublic) : true,
    password: optional(b.password),
  }
}
