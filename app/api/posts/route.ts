
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { createPostDirect } from '@/lib/mongodb-direct'
import { handleContentSafety } from '@/lib/content-safety'
import { logger } from '@/lib/logger'
import type { Prisma } from '@prisma/client'

// 模拟数据
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
    category: {
      id: '1',
      name: '讨论',
    },
    tags: ['灌水'],
    views: 1000,
    likes: 50,
    isPinned: false,
    isLocked: false,
    createdAt: new Date('2024-01-01'),
    _count: {
      comments: 10,
    },
  },
  {
    id: '2',
    title: '关于动态规划的学习心得',
    content: '最近学习了动态规划，总结了一些心得，希望对大家有帮助...',
    author: {
      id: '2',
      username: 'user2',
      nickname: '测试用户2',
      rating: 1600,
      color: '#3b82f6',
      avatar: '',
    },
    category: {
      id: '1',
      name: '讨论',
    },
    tags: ['学习', '动态规划'],
    views: 2000,
    likes: 100,
    isPinned: true,
    isLocked: false,
    createdAt: new Date('2024-01-02'),
    _count: {
      comments: 20,
    },
  },
  {
    id: '3',
    title: 'A+B Problem 题解',
    content: '这道题很简单，直接输入输出即可。',
    author: {
      id: '3',
      username: 'assistant',
      nickname: '系统管理员',
      rating: 3000,
      color: '#dc2626',
      avatar: '',
    },
    category: {
      id: '2',
      name: '题解',
    },
    tags: ['题解', '入门'],
    views: 3000,
    likes: 150,
    isPinned: false,
    isLocked: false,
    createdAt: new Date('2024-01-03'),
    _count: {
      comments: 5,
    },
  },
  {
    id: '4',
    title: '如何高效学习算法？',
    content: '大家有什么学习算法的好方法吗？分享一下经验。',
    author: {
      id: '4',
      username: 'user3',
      nickname: '测试用户3',
      rating: 1400,
      color: '#22c55e',
      avatar: '',
    },
    category: {
      id: '1',
      name: '讨论',
    },
    tags: ['学习', '算法'],
    views: 1500,
    likes: 75,
    isPinned: false,
    isLocked: false,
    createdAt: new Date('2024-01-04'),
    _count: {
      comments: 15,
    },
  },
  {
    id: '5',
    title: '竞赛准备经验分享',
    content: '分享一下我的竞赛准备经验，希望对大家有所帮助。',
    author: {
      id: '5',
      username: 'user4',
      nickname: '测试用户4',
      rating: 1900,
      color: '#f59e0b',
      avatar: '',
    },
    category: {
      id: '1',
      name: '讨论',
    },
    tags: ['竞赛', '经验分享'],
    views: 1800,
    likes: 90,
    isPinned: false,
    isLocked: false,
    createdAt: new Date('2024-01-05'),
    _count: {
      comments: 12,
    },
  },
]

// GET /api/posts - 获取帖子列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const tag = searchParams.get('tag')
    const categoryId = searchParams.get('categoryId')
    const search = searchParams.get('search')
    const sort = searchParams.get('sort') || 'latest' // latest, hot
    const type = searchParams.get('type') // discussion, question, etc.

    const where: Prisma.PostWhereInput = {
      isDeleted: false,
      status: 'published',
    }

    if (tag && tag !== '全部') {
      where.tags = { has: tag }
    }

    if (categoryId && categoryId !== 'all') {
      where.categoryId = categoryId
    }
    
    if (type) {
      where.type = type
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
      ]
    }

    let orderBy: Prisma.PostOrderByWithRelationInput = { createdAt: 'desc' }
    if (sort === 'hot') {
      orderBy = { likes: 'desc' }
    } else if (sort === 'views') {
      orderBy = { views: 'desc' }
    }

    const finalOrderBy: Prisma.PostOrderByWithRelationInput[] = [
      { isPinned: 'desc' },
      orderBy
    ]

    // 尝试从数据库获取数据
    try {
      const [posts, total] = await Promise.all([
        prisma.post.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
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
            category: {
              select: {
                id: true,
                name: true,
              },
            },
            _count: {
              select: {
                comments: true,
              },
            },
          },
        }),
        prisma.post.count({ where }),
      ])

      return NextResponse.json({
        success: true,
        data: {
          posts,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        },
      })
    } catch (dbError) {
      // 数据库连接失败，使用模拟数据
      logger.warn('数据库连接失败，使用模拟数据')
      
      // 过滤模拟数据
      let filteredPosts = [...mockPosts]
      
      if (tag && tag !== '全部') {
        filteredPosts = filteredPosts.filter(p => p.tags.includes(tag))
      }
      
      if (categoryId && categoryId !== 'all') {
        filteredPosts = filteredPosts.filter(p => p.category.id === categoryId)
      }
      
      if (search) {
        const searchLower = search.toLowerCase()
        filteredPosts = filteredPosts.filter(p => 
          p.title.toLowerCase().includes(searchLower) ||
          p.content.toLowerCase().includes(searchLower)
        )
      }
      
      // 排序
      if (sort === 'hot') {
        filteredPosts.sort((a, b) => b.likes - a.likes)
      } else if (sort === 'views') {
        filteredPosts.sort((a, b) => b.views - a.views)
      } else {
        filteredPosts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      }
      
      // 置顶帖子优先
      filteredPosts.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1
        if (!a.isPinned && b.isPinned) return 1
        return 0
      })
      
      // 分页
      const total = filteredPosts.length
      const start = (page - 1) * limit
      const end = start + limit
      const paginatedPosts = filteredPosts.slice(start, end)
      
      return NextResponse.json({
        success: true,
        data: {
          posts: paginatedPosts,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        },
      })
    }
  } catch (error) {
    logger.error('获取帖子列表错误:', error)
    return NextResponse.json(
      { success: false, error: '获取帖子列表失败' },
      { status: 500 }
    )
  }
}

// POST /api/posts - 创建帖子
export async function POST(request: NextRequest) {
  try {
    const currentUser = getUserFromRequest(request)
    if (!currentUser) {
      return NextResponse.json(
        { success: false, error: '请先登录' },
        { status: 401 }
      )
    }

    const body = await request.json()
    
    if (!body.title || !body.content) {
       return NextResponse.json(
        { success: false, error: '标题和内容不能为空' },
        { status: 400 }
      )
    }

    // 验证分类权限：如果是公告分类，要求管理员权限
    if (body.categoryId) {
      const category = await prisma.category.findUnique({
        where: { id: body.categoryId }
      })
      
      if (category?.name === '公告' && !currentUser.isAdmin) {
        return NextResponse.json(
          { success: false, error: '只有管理员可以发布公告' },
          { status: 403 }
        )
      }
    }

    // 处理内容安全
    const safeTitle = handleContentSafety(body.title)
    const safeContent = handleContentSafety(body.content)
    
    // 使用 direct helper 避免 Prisma 事务错误
    const post = await createPostDirect({
      title: safeTitle,
      content: safeContent,
      authorId: currentUser.userId,
      categoryId: body.categoryId,
      tags: body.tags || [],
      status: body.status || 'published', // 支持草稿 'draft'
      type: body.type,
    })

    return NextResponse.json(
      {
        success: true,
        data: post,
        message: '帖子发布成功',
      },
      { status: 201 }
    )
  } catch (error) {
    logger.error('创建帖子错误:', error)
    return NextResponse.json(
      { success: false, error: '发布帖子失败' },
      { status: 500 }
    )
  }
}
