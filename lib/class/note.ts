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
      n =>
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        n.category.toLowerCase().includes(q) ||
        n.tags.some(t => t.toLowerCase().includes(q))
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

export async function markClassNoteRead(classId: string, noteId: string, userId: string) {
  await prisma.noteReadHistory.upsert({
    where: { userId_noteId: { userId, noteId } },
    update: { readAt: new Date() },
    create: { classId, noteId, userId, readAt: new Date() },
  })
}
