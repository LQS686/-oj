/**
 * lib/post/service.ts
 * 帖子 + 评论 CRUD
 */
import { prisma } from '@/lib/prisma'
import { cache } from '@/lib/cache'
import { handleContentSafety } from '@/lib/content-safety'
import { createPostDirect, createCommentDirect, softDeletePostDirect, softDeleteCommentDirect, checkPostLikeDirect, createPostLikeDirect, deletePostLikeDirect, incrementPostViewsDirect, updatePostDirect } from '@/lib/mongodb-direct'
import { logger } from '@/lib/logger'
import { DEFAULT_PAGE_SIZE, type ListOptions, type PaginatedResult } from '@/lib/types/common'

// 模拟数据：DB 不可用时的兜底（保持向后兼容）
const mockPosts = [
  {
    id: '1',
    title: '新人报到，请多关照',
    content: '大家好，我是新来的，希望能在这里学到很多东西！',
    author: {
      id: '1',
      username: 'user1',
      nickname: '测试用户1',
      rating: 1200,
      color: '#808080',
      avatar: '',
    },
    category: { id: '1', name: '讨论' },
    tags: ['灌水'],
    views: 1000,
    likes: 50,
    isPinned: false,
    isLocked: false,
    createdAt: new Date('2024-01-01'),
    _count: { comments: 10 },
  },
  {
    id: '2',
    title: '关于动态规划的学习心得',
    content: '最近学习了动态规划，总结了一些心得，希望对大家有帮助...',
    author: { id: '2', username: 'user2', nickname: '测试用户2', rating: 1600, color: '#3b82f6', avatar: '' },
    category: { id: '1', name: '讨论' },
    tags: ['学习', '动态规划'],
    views: 2000,
    likes: 100,
    isPinned: true,
    isLocked: false,
    createdAt: new Date('2024-01-02'),
    _count: { comments: 20 },
  },
  {
    id: '3',
    title: 'A+B Problem 题解',
    content: '这道题很简单，直接输入输出即可。',
    author: { id: '3', username: 'assistant', nickname: '系统管理员', rating: 3000, color: '#dc2626', avatar: '' },
    category: { id: '2', name: '题解' },
    tags: ['题解', '入门'],
    views: 3000,
    likes: 150,
    isPinned: false,
    isLocked: false,
    createdAt: new Date('2024-01-03'),
    _count: { comments: 5 },
  },
  {
    id: '4',
    title: '如何高效学习算法？',
    content: '大家有什么学习算法的好方法吗？分享一下经验。',
    author: { id: '4', username: 'user3', nickname: '测试用户3', rating: 1400, color: '#22c55e', avatar: '' },
    category: { id: '1', name: '讨论' },
    tags: ['学习', '算法'],
    views: 1500,
    likes: 75,
    isPinned: false,
    isLocked: false,
    createdAt: new Date('2024-01-04'),
    _count: { comments: 15 },
  },
  {
    id: '5',
    title: '竞赛准备经验分享',
    content: '分享一下我的竞赛准备经验，希望对大家有所帮助。',
    author: { id: '5', username: 'user4', nickname: '测试用户4', rating: 1900, color: '#f59e0b', avatar: '' },
    category: { id: '1', name: '讨论' },
    tags: ['竞赛', '经验分享'],
    views: 1800,
    likes: 90,
    isPinned: false,
    isLocked: false,
    createdAt: new Date('2024-01-05'),
    _count: { comments: 12 },
  },
]

const mockComments: Record<string, any[]> = {
  '1': [
    { id: 'c1', content: '欢迎新同学！', author: { id: '2', username: 'user2', nickname: '测试用户2', avatar: '', rating: 1600, color: '#3b82f6' }, createdAt: new Date('2024-01-01T10:00:00'), parentId: null, _count: { replies: 2 } },
    { id: 'c2', content: '你好，很高兴认识你！', author: { id: '3', username: 'assistant', nickname: '系统管理员', avatar: '', rating: 3000, color: '#dc2626' }, createdAt: new Date('2024-01-01T11:00:00'), parentId: null, _count: { replies: 1 } },
  ],
  '2': [
    { id: 'c3', content: '写得很好，谢谢分享！', author: { id: '3', username: 'assistant', nickname: '系统管理员', avatar: '', rating: 3000, color: '#dc2626' }, createdAt: new Date('2024-01-02T10:00:00'), parentId: null, _count: { replies: 0 } },
  ],
  '3': [
    { id: 'c4', content: '确实很简单', author: { id: '1', username: 'user1', nickname: '测试用户1', avatar: '', rating: 1200, color: '#808080' }, createdAt: new Date('2024-01-03T10:00:00'), parentId: null, _count: { replies: 0 } },
  ],
  '4': [
    { id: 'c5', content: '多做题，多总结', author: { id: '2', username: 'user2', nickname: '测试用户2', avatar: '', rating: 1600, color: '#3b82f6' }, createdAt: new Date('2024-01-04T10:00:00'), parentId: null, _count: { replies: 1 } },
  ],
  '5': [
    { id: 'c6', content: '谢谢分享，很有帮助', author: { id: '1', username: 'user1', nickname: '测试用户1', avatar: '', rating: 1200, color: '#808080' }, createdAt: new Date('2024-01-05T10:00:00'), parentId: null, _count: { replies: 0 } },
  ],
}

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

/**
 * 清空帖子详情缓存
 * （被 updateUserPost / softDeleteUserPost / togglePostLike 等调用）
 */
export function clearPostCache(id: string) {
  cache.delete(`post:byId:${id}`)
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
    clearPostCache(postId)
    return { liked: false }
  } else {
    await prisma.postLike.create({ data: { userId, postId } })
    await prisma.post.update({ where: { id: postId }, data: { likes: { increment: 1 } } })
    clearPostCache(postId)
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

/* ============================================================================
 * 业务封装：保留旧版 /api/posts 路由的复杂行为
 * ========================================================================== */

export interface ListPostsAdvancedOptions {
  page: number
  limit: number
  tag?: string
  categoryId?: string
  search?: string
  sort?: 'latest' | 'hot' | 'views'
  type?: string
}

/**
 * 帖子列表（带置顶/排序/DB 不可用兜底）
 */
export async function listPostsAdvanced(opts: ListPostsAdvancedOptions) {
  const where: any = {
    isDeleted: false,
    status: 'published',
  }
  if (opts.tag && opts.tag !== '全部') where.tags = { has: opts.tag }
  if (opts.categoryId && opts.categoryId !== 'all') where.categoryId = opts.categoryId
  if (opts.type) where.type = opts.type
  if (opts.search) {
    where.OR = [
      { title: { contains: opts.search, mode: 'insensitive' } },
      { content: { contains: opts.search, mode: 'insensitive' } },
    ]
  }

  let orderBy: any = { createdAt: 'desc' }
  if (opts.sort === 'hot') orderBy = { likes: 'desc' }
  else if (opts.sort === 'views') orderBy = { views: 'desc' }

  const finalOrderBy: any[] = [{ isPinned: 'desc' }, orderBy]

  try {
    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        skip: (opts.page - 1) * opts.limit,
        take: opts.limit,
        orderBy: finalOrderBy,
        include: {
          author: {
            select: {
              id: true,
              username: true,
              nickname: true,
              rating: true,
              color: true,
              avatar: true,
            },
          },
          category: { select: { id: true, name: true } },
          _count: { select: { comments: true } },
        },
      }),
      prisma.post.count({ where }),
    ])
    return {
      posts,
      pagination: {
        page: opts.page,
        limit: opts.limit,
        total,
        totalPages: Math.ceil(total / opts.limit),
      },
    }
  } catch (dbError) {
    // 数据库连接失败，使用模拟数据
    logger.warn('数据库连接失败，使用模拟数据')
    let filteredPosts = [...mockPosts]
    if (opts.tag && opts.tag !== '全部') {
      filteredPosts = filteredPosts.filter(p => p.tags.includes(opts.tag!))
    }
    if (opts.categoryId && opts.categoryId !== 'all') {
      filteredPosts = filteredPosts.filter(p => p.category.id === opts.categoryId)
    }
    if (opts.search) {
      const s = opts.search.toLowerCase()
      filteredPosts = filteredPosts.filter(p =>
        p.title.toLowerCase().includes(s) || p.content.toLowerCase().includes(s)
      )
    }
    if (opts.sort === 'hot') filteredPosts.sort((a, b) => b.likes - a.likes)
    else if (opts.sort === 'views') filteredPosts.sort((a, b) => b.views - a.views)
    else filteredPosts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    filteredPosts.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1
      if (!a.isPinned && b.isPinned) return 1
      return 0
    })

    const total = filteredPosts.length
    const start = (opts.page - 1) * opts.limit
    const paginatedPosts = filteredPosts.slice(start, start + opts.limit)
    return {
      posts: paginatedPosts,
      pagination: {
        page: opts.page,
        limit: opts.limit,
        total,
        totalPages: Math.ceil(total / opts.limit),
      },
    }
  }
}

export interface CreatePostInput {
  title: string
  content: string
  categoryId?: string
  tags?: string[]
  status?: string
  type?: string
}

/**
 * 创建帖子（含分类权限校验、内容安全、MongoDB direct 写入）
 */
export async function createUserPost(input: CreatePostInput, authorId: string, isAdmin: boolean) {
  // 验证分类权限：公告分类要求管理员权限
  if (input.categoryId) {
    const category = await prisma.category.findUnique({ where: { id: input.categoryId } })
    if (category?.name === '公告' && !isAdmin) {
      const err: any = new Error('只有管理员可以发布公告')
      err.status = 403
      throw err
    }
  }
  const safeTitle = handleContentSafety(input.title)
  const safeContent = handleContentSafety(input.content)
  return createPostDirect({
    title: safeTitle,
    content: safeContent,
    authorId,
    categoryId: input.categoryId,
    tags: input.tags || [],
    status: input.status || 'published',
    type: input.type,
  })
}

/**
 * 获取帖子详情 + 评论（带 DB 兜底）
 */
export async function getPostDetailWithComments(id: string, viewerId?: string) {
  try {
    const post = await prisma.post.findUnique({
      where: { id },
      include: {
        author: {
          select: { id: true, username: true, nickname: true, rating: true, color: true, avatar: true },
        },
        category: { select: { id: true, name: true } },
        _count: { select: { comments: true, postLikes: true } },
      },
    })
    if (!post || post.isDeleted) return { found: false as const }

    let isLiked = false
    if (viewerId) {
      isLiked = await checkPostLikeDirect(viewerId, post.id)
    }
    incrementPostViewsDirect(post.id, viewerId).catch(err => logger.error('增加帖子浏览量失败', err))

    const comments = await prisma.comment.findMany({
      where: { postId: id, isDeleted: false },
      include: {
        author: {
          select: { id: true, username: true, nickname: true, avatar: true, rating: true, color: true },
        },
        _count: { select: { replies: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    const postData = {
      id: post.id,
      title: post.title,
      content: post.content,
      author: post.author,
      category: post.category,
      tags: post.tags,
      views: post.views,
      likes: post.likes || post._count.postLikes,
      replies: post._count.comments,
      isLiked,
      createdAt: post.createdAt,
    }
    return { found: true as const, post: postData, comments }
  } catch (dbError) {
    logger.warn('数据库连接失败，使用模拟数据')
    const post = mockPosts.find(p => p.id === id)
    if (!post) return { found: false as const }
    const comments = mockComments[id] || []
    return {
      found: true as const,
      post: { ...post, isLiked: false, replies: post._count.comments },
      comments,
    }
  }
}

/**
 * 更新帖子（作者或管理员）
 */
export async function updateUserPost(
  id: string,
  data: {
    title?: string
    content?: string
    categoryId?: string
    tags?: string[]
    status?: string
    isPinned?: boolean
    isLocked?: boolean
  }
) {
  await updatePostDirect(id, data)
  clearPostCache(id)
}

/**
 * 逻辑删除帖子
 */
export async function softDeleteUserPost(id: string) {
  await softDeletePostDirect(id)
  clearPostCache(id)
}

/**
 * 获取帖子评论（DB 不可用时使用 mock）
 */
export async function getPostComments(postId: string) {
  try {
    return await prisma.comment.findMany({
      where: { postId },
      orderBy: { createdAt: 'asc' },
      include: {
        author: {
          select: { id: true, username: true, nickname: true, avatar: true, rating: true, color: true },
        },
        parent: {
          select: {
            author: {
              select: { username: true, nickname: true },
            },
          },
        },
      },
    })
  } catch (dbError) {
    logger.warn('数据库连接失败，使用模拟数据')
    return mockComments[postId] || []
  }
}

/**
 * 创建评论（含父评论校验 + 内容安全）
 */
export async function createUserComment(input: { postId: string; content: string; parentId?: string; authorId: string }) {
  // 验证帖子是否存在
  const post = await prisma.post.findUnique({ where: { id: input.postId } })
  if (!post) {
    const err: any = new Error('帖子不存在')
    err.status = 404
    throw err
  }
  if (input.parentId) {
    const parent = await prisma.comment.findUnique({ where: { id: input.parentId } })
    if (!parent) {
      const err: any = new Error('父评论不存在')
      err.status = 404
      throw err
    }
  }
  const safeContent = handleContentSafety(input.content)
  return createCommentDirect({
    content: safeContent,
    postId: input.postId,
    authorId: input.authorId,
    parentId: input.parentId,
  })
}

/**
 * 逻辑删除评论（作者或管理员）
 */
export async function softDeleteUserComment(commentId: string, postId: string, requesterId: string, isAdmin: boolean) {
  const comment = await prisma.comment.findUnique({ where: { id: commentId } })
  if (!comment) {
    const err: any = new Error('评论不存在')
    err.status = 404
    throw err
  }
  if (comment.postId !== postId) {
    const err: any = new Error('评论不属于该帖子')
    err.status = 400
    throw err
  }
  if (comment.authorId !== requesterId && !isAdmin) {
    const err: any = new Error('无权删除此评论')
    err.status = 403
    throw err
  }
  await softDeleteCommentDirect(commentId)
}

/**
 * 切换帖子点赞（返回当前状态）
 */
export async function togglePostLikeMongo(userId: string, postId: string) {
  const isLiked = await checkPostLikeDirect(userId, postId)
  if (isLiked) {
    await deletePostLikeDirect(userId, postId)
    return { isLiked: false }
  } else {
    await createPostLikeDirect(userId, postId)
    return { isLiked: true }
  }
}

/* ============================================================================
 * 管理员帖子管理（原 /api/admin/posts*）
 * ========================================================================== */

/** 管理员列出所有帖子（未删除） */
export async function listAllPostsForAdmin() {
  return prisma.post.findMany({
    orderBy: { createdAt: 'desc' },
    where: { isDeleted: false },
    include: {
      author: { select: { username: true } },
      _count: { select: { comments: true, postLikes: true } },
    },
  })
}

/** 管理员通过 MongoDB 直接驱动更新帖子后，重新查询（绕过 Prisma 事务限制） */
export async function getPostAfterMongoDirectUpdate(id: string) {
  return prisma.post.findUnique({ where: { id } })
}

/** 读帖子基础信息（仅 authorId）用于权限校验 */
export async function getPostAuthor(id: string) {
  return prisma.post.findUnique({ where: { id } })
}

/**
 * 最新评论（公开 + 含所属帖子）
 */
export async function listRecentPublishedComments(limit = 5) {
  return prisma.comment.findMany({
    where: {
      isDeleted: false,
      post: { isDeleted: false, status: 'published' },
    },
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: {
      author: { select: { id: true, username: true, nickname: true, avatar: true, color: true } },
      post: { select: { id: true, title: true } },
    },
  })
}
