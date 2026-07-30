/**
 * lib/notification/validation.ts
 * 通知参数校验
 */
import { required, optional, toBool, asRecord } from '@/lib/api/validation'

export function parseNotificationQuery(q: Record<string, string>) {
  return {
    unreadOnly: toBool(q.unreadOnly),
  }
}

export function parseNotificationCreate(body: unknown) {
  const b = asRecord(body)
  return {
    type: required(b.type, '类型'),
    title: required(b.title, '标题'),
    content: required(b.content, '内容'),
    link: optional(b.link),
  }
}
