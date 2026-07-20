/**
 * lib/class/note-service.ts
 * 班级笔记相关 service 层函数（原 service.ts 中遗留的实现，
 * 与 note.ts 中不同函数的简版/分页版实现，保持向后兼容）
 */

import { prisma } from '@/lib/prisma'

/* ============================================================================
 * 班级笔记
 * ========================================================================== */

export interface ListClassNotesInput {
  page?: number
  pageSize?: number
  category?: string
  search?: string
}

export async function listClassNotesPaged(classId: string, filter: ListClassNotesInput = {}) {
  const page = filter.page ?? 1
  const pageSize = filter.pageSize ?? 20
  const where: any = { classId }
  if (filter.category) where.category = filter.category
  if (filter.search) {
    where.OR = [
      { title: { contains: filter.search, mode: 'insensitive' } },
      { content: { contains: filter.search, mode: 'insensitive' } },
      { tags: { has: filter.search } },
    ]
  }

  const [notes, total] = await Promise.all([
    prisma.classNote.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        author: { select: { id: true, username: true, nickname: true, avatar: true } },
      },
    }),
    prisma.classNote.count({ where }),
  ])

  return {
    notes: notes.map((n: any) => ({
      id: n.id,
      title: n.title,
      content: n.content,
      category: n.category,
      tags: n.tags || [],
      author: {
        id: n.author.id,
        username: n.author.username,
        nickname: n.author.nickname,
        avatar: n.author.avatar,
      },
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  }
}

export async function createClassNoteSimple(
  classId: string,
  authorId: string,
  data: { title: string; content: string; category?: string; tags?: string[] }
) {
  return prisma.classNote.create({
    data: {
      classId,
      authorId,
      title: data.title,
      content: data.content,
      category: data.category || 'General',
      tags: data.tags || [],
    },
  })
}

export async function getClassNoteWithAuthor(noteId: string) {
  return prisma.classNote.findUnique({
    where: { id: noteId },
    include: {
      author: { select: { id: true, username: true, nickname: true, avatar: true } },
    },
  })
}

export async function getClassNoteSimple(classId: string, noteId: string) {
  return prisma.classNote.findUnique({ where: { id: noteId, classId } })
}

export async function updateClassNoteFields(
  noteId: string,
  data: { title?: string; content?: string; category?: string; tags?: string[] }
) {
  return prisma.classNote.update({ where: { id: noteId }, data })
}

export async function deleteClassNoteSimple(noteId: string) {
  return prisma.classNote.delete({ where: { id: noteId } })
}
