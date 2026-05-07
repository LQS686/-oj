
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { updatePostDirect, softDeletePostDirect, checkPostLikeDirect, incrementPostViewsDirect } from '@/lib/mongodb-direct'
import { logger } from '@/lib/logger'

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
      username: 'admin',
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

// 模拟评论数据
const mockComments = {
  '1': [
    {
      id: 'c1',
      content: '欢迎新同学！',
      author: {
        id: '2',
        username: 'user2',
        nickname: '测试用户2',
        avatar: '',
        rating: 1600,
        color: '#3b82f6',
      },
      createdAt: new Date('2024-01-01T10:00:00'),
      parentId: null,
      _count: {
        replies: 2,
      },
    },
    {
      id: 'c2',
      content: '你好，很高兴认识你！',
      author: {
        id: '3',
        username: 'admin',
        nickname: '系统管理员',
        avatar: '',
        rating: 3000,
        color: '#dc2626',
      },
      createdAt: new Date('2024-01-01T11:00:00'),
      parentId: null,
      _count: {
        replies: 1,
      },
    },
  ],
  '2': [
    {
      id: 'c3',
      content: '写得很好，谢谢分享！',
      author: {
        id: '3',
        username: 'admin',
        nickname: '系统管理员',
        avatar: '',
        rating: 3000,
        color: '#dc2626',
      },
      createdAt: new Date('2024-01-02T10:00:00'),
      parentId: null,
      _count: {
        replies: 0,
      },
    },
  ],
  '3': [
    {
      id: 'c4',
      content: '确实很简单',
      author: {
        id: '1',
        username: 'user1',
        nickname: '测试用户1',
        avatar: '',
        rating: 1200,
        color: '#808080',
      },
      createdAt: new Date('2024-01-03T10:00:00'),
      parentId: null,
      _count: {
        replies: 0,
      },
    },
  ],
  '4': [
    {
      id: 'c5',
      content: '多做题，多总结',
      author: {
        id: '2',
        username: 'user2',
        nickname: '测试用户2',
        avatar: '',
        rating: 1600,
        color: '#3b82f6',
      },
      createdAt: new Date('2024-01-04T10:00:00'),
      parentId: null,
      _count: {
        replies: 1,
      },
    },
  ],
  '5': [
    {
      id: 'c6',
      content: '谢谢分享，很有帮助',
      author: {
        id: '1',
        username: 'user1',
        nickname: '测试用户1',
        avatar: '',
        rating: 1200,
        color: '#808080',
      },
      createdAt: new Date('2024-01-05T10:00:00'),
      parentId: null,
      _count: {
        replies: 0,
      },
    },
  ],
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    // 尝试从数据库获取数据
    try {
      const post = await prisma.post.findUnique({
        where: { id },
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
              postLikes: true,
            }
          }
        },
      })

      if (!post || post.isDeleted) {
        return NextResponse.json(
          { success: false, error: '帖子不存在或已删除' },
          { status: 404 }
        )
      }

      let isLiked = false
      const currentUser = getUserFromRequest(request)
      if (currentUser) {
        isLiked = await checkPostLikeDirect(currentUser.userId, post.id)
      }

      incrementPostViewsDirect(post.id, currentUser?.userId).catch(err => logger.error('增加帖子浏览量失败', err))

      const comments = await prisma.comment.findMany({
        where: {
          postId: id,
          isDeleted: false,
        },
        include: {
          author: {
            select: {
              id: true,
              username: true,
              nickname: true,
              avatar: true,
              rating: true,
              color: true,
            },
          },
          _count: {
            select: {
              replies: true,
            },
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
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

      return NextResponse.json({
        success: true,
        data: {
          post: postData,
          comments,
        },
      })
    } catch (dbError) {
      // 数据库连接失败，使用模拟数据
      logger.warn('数据库连接失败，使用模拟数据')
      
      const post = mockPosts.find(p => p.id === id)
      if (!post) {
        return NextResponse.json(
          { success: false, error: '帖子不存在或已删除' },
          { status: 404 }
        )
      }
      
      const comments = mockComments[id as keyof typeof mockComments] || []
      
      return NextResponse.json({
        success: true,
        data: {
          post: {
            ...post,
            isLiked: false,
            replies: post._count.comments,
          },
          comments,
        },
      })
    }
  } catch (error) {
    logger.error('获取帖子详情错误', error)
    return NextResponse.json(
      { success: false, error: '获取帖子详情失败' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const currentUser = getUserFromRequest(request)
    if (!currentUser) {
      return NextResponse.json(
        { success: false, error: '请先登录' },
        { status: 401 }
      )
    }

    const post = await prisma.post.findUnique({
      where: { id },
    })

    if (!post) {
      return NextResponse.json(
        { success: false, error: '帖子不存在' },
        { status: 404 }
      )
    }

    // 检查权限：作者或管理员
    if (post.authorId !== currentUser.userId && !currentUser.isAdmin) {
      return NextResponse.json(
        { success: false, error: '无权修改此帖子' },
        { status: 403 }
      )
    }

    const body = await request.json()
    
    // 使用 direct update
    await updatePostDirect(id, {
      title: body.title,
      content: body.content,
      categoryId: body.categoryId,
      tags: body.tags,
      status: body.status,
      isPinned: currentUser.isAdmin ? body.isPinned : undefined, // 仅管理员可置顶
      isLocked: currentUser.isAdmin ? body.isLocked : undefined,
    })

    return NextResponse.json({
      success: true,
      message: '帖子更新成功',
    })
  } catch (error) {
    logger.error('更新帖子错误', error)
    return NextResponse.json(
      { success: false, error: '更新帖子失败' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const currentUser = getUserFromRequest(request)
    if (!currentUser) {
      return NextResponse.json(
        { success: false, error: '请先登录' },
        { status: 401 }
      )
    }

    const post = await prisma.post.findUnique({
      where: { id },
    })

    if (!post) {
      return NextResponse.json(
        { success: false, error: '帖子不存在' },
        { status: 404 }
      )
    }

    // 检查权限：作者或管理员
    if (post.authorId !== currentUser.userId && !currentUser.isAdmin) {
      return NextResponse.json(
        { success: false, error: '无权删除此帖子' },
        { status: 403 }
      )
    }

    // 逻辑删除
    await softDeletePostDirect(id)

    return NextResponse.json({
      success: true,
      message: '帖子已删除',
    })
  } catch (error) {
    logger.error('删除帖子错误', error)
    return NextResponse.json(
      { success: false, error: '删除帖子失败' },
      { status: 500 }
    )
  }
}
