/**
 * lib/class/note.ts
 * 班级笔记 CRUD + 阅读统计
 */

import { prisma } from '@/lib/prisma'

export interface CreateClassNoteInput {
  classId: string
  title: string
  content: string
  category: string
  tags: string[]
  authorId: string
  isPublic?: boolean
}

export interface ListClassNotesFilter {
  category?: string
  search?: string
  onlyMine?: boolean
  authorId?: string
  skip?: number
  take?: number
}

export async function createClassNote(input: CreateClassNoteInput) {
  return prisma.classNote.create({
    data: {
      classId: input.classId,
      title: input.title,
      content: input.content,
      category: input.category,
      tags: input.tags,
      authorId: input.authorId,
      isPublic: input.isPublic ?? true,
    },
  })
}

export async function getClassNote(noteId: string) {
  return prisma.classNote.findUnique({ where: { id: noteId } })
}

export async function listClassNotes(
  classId: string,
  filter: ListClassNotesFilter = {}
) {
  const { category, search, onlyMine, authorId, skip = 0, take = 50 } = filter

  const where: any = { classId }
  if (category) where.category = category
  if (onlyMine && authorId) where.authorId = authorId
  else if (authorId) where.authorId = authorId

  const notes = await prisma.classNote.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    skip,
    take,
  })

  if (search) {
    const q = search.toLowerCase()
    return notes.filter(
      (n: any) =>
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        n.category.toLowerCase().includes(q) ||
        n.tags.some((t: any) => t.toLowerCase().includes(q))
    )
  }
  return notes
}

export async function updateClassNote(
  noteId: string,
  data: Partial<Omit<CreateClassNoteInput, 'classId' | 'authorId'>>
) {
  return prisma.classNote.update({ where: { id: noteId }, data })
}

export async function deleteClassNote(noteId: string) {
  return prisma.classNote.delete({ where: { id: noteId } })
}

export async function incrementClassNoteViews(noteId: string) {
  return prisma.classNote.update({
    where: { id: noteId },
    data: { views: { increment: 1 } },
  })
}

/* -------------------------------------------------------------------------- */
/* 分页 / 简版 API（原 note-service.ts，已合并至此文件）                        */
/* -------------------------------------------------------------------------- */

export interface ListClassNotesInput {
  page?: number
  pageSize?: number
  category?: string
  search?: string
}

export async function listClassNotesPaged(classId: string, filter: ListClassNotesInput = {}) {
  const page = filter.page ?? 1
  const pageSize = Math.min(filter.pageSize ?? 20, 100)
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
