/**
 * lib/class/validation.ts
 * 班级参数校验
 */
import { required, optional, toInt, toBool } from '@/lib/api/validation'
import { validateObjectId } from '@/lib/api/validation'

export function parseClassCreate(body: any) {
  return {
    name: required(body?.name, '班级名称'),
    description: optional(body?.description),
    isPublic: body?.isPublic ? toBool(body.isPublic) : false,
  }
}

export function parseClassUpdate(body: any) {
  return {
    name: optional(body?.name),
    description: optional(body?.description),
    isPublic: body?.isPublic !== undefined ? toBool(body.isPublic) : undefined,
  }
}

export function parseInviteCreate(body: any) {
  return {
    maxUses: toInt(body?.maxUses, 'maxUses', 1),
    expiresAt: body?.expiresAt ? new Date(body.expiresAt) : undefined,
    role: optional(body?.role) ?? 'student',
  }
}

export function parseAssignmentCreate(body: any) {
  return {
    title: required(body?.title, '作业标题'),
    description: optional(body?.description),
    problemIds: body?.problemIds || [],
    deadline: body?.deadline ? new Date(body.deadline) : undefined,
  }
}

export function parseNoteCreate(body: any) {
  return {
    title: required(body?.title, '通知标题'),
    content: required(body?.content, '通知内容'),
    pinned: body?.pinned ? toBool(body.pinned) : false,
  }
}
