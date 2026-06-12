/**
 * lib/post/service.ts
 * 帖子 + 评论 CRUD
 */
import { prisma } from '@/lib/prisma'
import { cache } from '@/lib/cache'
import { DEFAULT_PAGE_SIZE, type ListOptions, type PaginatedResult } from '@/lib/types/common'

export interface PostFilter {
  keyword?: string
  authorId?: string
  tagIds?: string[]
  categoryId?: string
}

export async function listPosts(
  filter: PostFilter = {},
  options: ListOptions = {}
): Promise<PaginatedResult<any>> {
  const page = options.page ?? 1
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
  const where: any = {}
  if (filter.keyword) {
    where.OR = [
      { title: { contains: filter.keyword, mode: 'insensitive' } },
      { content: { contains: filter.keyword, mode: 'insensitive' } },
    ]
  }
  if (filter.authorId) where.authorId = filter.authorId
  if (filter.categoryId) where.categoryId = filter.categoryId
  if (filter.tagIds?.length) where.tags = { some: { tagId: { in: filter.tagIds } } }

  const [items, total] = await Promise.all([
    prisma.post.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { [options.sortBy || 'createdAt']: options.sortOrder || 'desc' },
      include: { author: { select: { id: true, username: true, nickname: true, avatar: true } } },
    }),
    prisma.post.count({ where }),
  ])
  return { items, total, page, pageSize }
}

export async function getPostById(id: string) {
  return cache.get('post:byId', [id], async () => {
    return prisma.post.findUnique({
      where: { id },
      include: { author: { select: { id: true, username: true, nickname: true, avatar: true } } },
    })
  }, { ttl: 30_000 })
}

export async function createPost(data: any, authorId: string) {
  return prisma.post.create({ data: { ...data, authorId } })
}

export async function updatePost(id: string, data: any) {
  cache.delete(`post:byId:${id}`)
  return prisma.post.update({ where: { id }, data })
}

export async function deletePost(id: string) {
  cache.delete(`post:byId:${id}`)
  return prisma.post.delete({ where: { id } })
}

export async function listComments(postId: string) {
  return prisma.comment.findMany({
    where: { postId },
    orderBy: { createdAt: 'asc' },
    include: { author: { select: { id: true, username: true, nickname: true, avatar: true } } },
  })
}

export async function createComment(data: { postId: string; content: string; authorId: string; parentId?: string }) {
  return prisma.comment.create({ data })
}

export async function deleteComment(id: string) {
  return prisma.comment.delete({ where: { id } })
}

export async function togglePostLike(postId: string, userId: string) {
  const existing = await prisma.postLike.findUnique({
    where: { userId_postId: { userId, postId } },
  })
  if (existing) {
    await prisma.postLike.delete({ where: { id: existing.id } })
    await prisma.post.update({ where: { id: postId }, data: { likes: { decrement: 1 } } })
    return { liked: false }
  } else {
    await prisma.postLike.create({ data: { userId, postId } })
    await prisma.post.update({ where: { id: postId }, data: { likes: { increment: 1 } } })
    return { liked: true }
  }
}

export async function listRecentComments(limit = 10) {
  return prisma.comment.findMany({
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: { author: { select: { id: true, username: true, nickname: true, avatar: true } } },
  })
}
