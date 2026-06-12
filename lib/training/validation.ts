/**
 * lib/training/validation.ts
 * 训练计划参数校验
 */
import { required, optional, toInt, toBool } from '@/lib/api/validation'
import { validateObjectId } from '@/lib/api/validation'

export function parseTrainingListQuery(q: Record<string, string>) {
  return {
    keyword: optional(q.keyword),
    isPublic: q.isPublic ? toBool(q.isPublic) : undefined,
    page: toInt(q.page, 'page', 1),
    pageSize: toInt(q.pageSize, 'pageSize', 20),
  }
}

export function parseTrainingCreate(body: any) {
  return {
    title: required(body?.title, '训练标题'),
    description: optional(body?.description),
    isPublic: body?.isPublic ? toBool(body.isPublic) : true,
    problems: body?.problems || [],
  }
}
