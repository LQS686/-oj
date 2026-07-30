/**
 * lib/training/validation.ts
 * 训练计划参数校验
 */
import { required, optional, toInt, toBool, asRecord } from '@/lib/api/validation'

export function parseTrainingListQuery(q: Record<string, string>) {
  return {
    keyword: optional(q.keyword),
    isPublic: q.isPublic ? toBool(q.isPublic) : undefined,
    page: toInt(q.page, 'page', 1),
    pageSize: toInt(q.pageSize, 'pageSize', 20),
  }
}

export function parseTrainingCreate(body: unknown) {
  const b = asRecord(body)
  return {
    title: required(b.title, '训练标题'),
    description: optional(b.description),
    isPublic: b.isPublic ? toBool(b.isPublic) : true,
    problems: Array.isArray(b.problems) ? b.problems : [],
  }
}
