/**
 * lib/notification/validation.ts
 * 通知参数校验
 */
import { required, optional, toBool } from '@/lib/api/validation'

export function parseNotificationQuery(q: Record<string, string>) {
  return {
    unreadOnly: toBool(q.unreadOnly),
  }
}

export function parseNotificationCreate(body: any) {
  return {
    type: required(body?.type, '类型'),
    title: required(body?.title, '标题'),
    content: required(body?.content, '内容'),
    link: optional(body?.link),
  }
}
