/**
 * lib/class/validation.ts
 * 班级参数校验
 */
import { required, optional, toBool, asRecord } from '@/lib/api/validation'

export function parseClassCreate(body: unknown) {
  const b = asRecord(body)
  return {
    name: required(b.name, '班级名称'),
    description: optional(b.description),
    isPublic: b.isPublic ? toBool(b.isPublic) : false,
  }
}

export function parseClassUpdate(body: unknown) {
  const b = asRecord(body)
  return {
    name: optional(b.name),
    description: optional(b.description),
    isPublic: b.isPublic !== undefined ? toBool(b.isPublic) : undefined,
  }
}

export function parseAssignmentCreate(body: unknown) {
  const b = asRecord(body)
  return {
    title: required(b.title, '作业标题'),
    description: optional(b.description),
    problemIds: Array.isArray(b.problemIds) ? b.problemIds : [],
    endTime: b.endTime ? new Date(String(b.endTime)) : undefined,
  }
}

export function parseNoteCreate(body: unknown) {
  const b = asRecord(body)
  return {
    title: required(b.title, '通知标题'),
    content: required(b.content, '通知内容'),
    pinned: b.pinned ? toBool(b.pinned) : false,
  }
}
