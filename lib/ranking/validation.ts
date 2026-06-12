/**
 * lib/ranking/validation.ts
 * 排行榜参数校验
 */
import { toInt } from '@/lib/api/validation'
import { validateObjectId } from '@/lib/api/validation'

export function parseRankingQuery(q: Record<string, string>) {
  return {
    type: (q.type || 'global') as 'global' | 'class' | 'contest' | 'weekly',
    classId: q.classId ? validateObjectId(q.classId, 'classId') : undefined,
    limit: toInt(q.limit, 'limit', 100),
  }
}
