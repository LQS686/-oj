
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { createCommentDirect, softDeleteCommentDirect } from '@/lib/mongodb-direct'
import { handleContentSafety } from '@/lib/content-safety'
import { logger } from '@/lib/logger'

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
      parent: null,
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
      parent: null,
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
      parent: null,
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
      parent: null,
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
      parent: null,
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
      parent: null,
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
      // Fetch ALL comments for the post (flat list)
      // We will build the tree on the client side to support infinite nesting
      // and custom display logic (flattening after N levels)
      const comments = await prisma.comment.findMany({
        where: {
          postId: id,
          // isDeleted: false // Optionally filter deleted
        },
        orderBy: {
          createdAt: 'asc'
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
          parent: {
            select: {
              author: {
                select: {
                  username: true,
                  nickname: true,
                }
              }
            }
          }
        },
      })

      return NextResponse.json({
        success: true,
        data: {
          comments,
          // Remove pagination for now as we fetch all
          // pagination: { ... } 
        },
      })
    } catch (dbError) {
      // 数据库连接失败，使用模拟数据
      logger.warn('数据库连接失败，使用模拟数据')
      
      const comments = mockComments[id as keyof typeof mockComments] || []
      
      return NextResponse.json({
        success: true,
        data: {
          comments,
          // Remove pagination for now as we fetch all
          // pagination: { ... } 
        },
      })
    }
  } catch (error) {
    logger.error('获取评论列表错误', error)
    return NextResponse.json(
      { success: false, error: '获取评论列表失败' },
      { status: 500 }
    )
  }
}

export async function POST(
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

    const body = await request.json()
    
    if (!body.content) {
      return NextResponse.json(
        { success: false, error: '评论内容不能为空' },
        { status: 400 }
      )
    }

    // 验证帖子是否存在
    const post = await prisma.post.findUnique({
      where: { id },
    })

    if (!post) {
      return NextResponse.json(
        { success: false, error: '帖子不存在' },
        { status: 404 }
      )
    }

    // 如果是回复，验证父评论是否存在
    if (body.parentId) {
      const parent = await prisma.comment.findUnique({
        where: { id: body.parentId },
      })
      if (!parent) {
        return NextResponse.json(
          { success: false, error: '父评论不存在' },
          { status: 404 }
        )
      }
    }

    // 处理内容安全
    const safeContent = handleContentSafety(body.content)
    
    const comment = await createCommentDirect({
      content: safeContent,
      postId: id,
      authorId: currentUser.userId,
      parentId: body.parentId,
    })

    return NextResponse.json(
      {
        success: true,
        data: comment,
        message: '评论发表成功',
      },
      { status: 201 }
    )
  } catch (error) {
    logger.error('发表评论错误', error)
    return NextResponse.json(
      { success: false, error: '发表评论失败' },
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

    const commentId = request.nextUrl.searchParams.get('commentId')
    if (!commentId) {
      return NextResponse.json(
        { success: false, error: '缺少评论ID' },
        { status: 400 }
      )
    }

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
    })

    if (!comment) {
      return NextResponse.json(
        { success: false, error: '评论不存在' },
        { status: 404 }
      )
    }

    if (comment.postId !== id) {
      return NextResponse.json(
        { success: false, error: '评论不属于该帖子' },
        { status: 400 }
      )
    }

    if (comment.authorId !== currentUser.userId && !currentUser.isAdmin) {
      return NextResponse.json(
        { success: false, error: '无权删除此评论' },
        { status: 403 }
      )
    }

    await softDeleteCommentDirect(commentId)

    return NextResponse.json({
      success: true,
      message: '评论已删除',
    })
  } catch (error) {
    logger.error('删除评论错误', error)
    return NextResponse.json(
      { success: false, error: '删除评论失败' },
      { status: 500 }
    )
  }
}
