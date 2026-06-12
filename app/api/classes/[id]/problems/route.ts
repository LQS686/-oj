/**
 * 班级题目管理 API
 * - GET /api/classes/[id]/problems - 获取班级题目列表
 * - POST /api/classes/[id]/problems - 添加题目到班级（从公共题库或创建新题目）
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { Prisma } from '@prisma/client'

interface RouteContext {
  params: Promise<{ id: string }>
}

// 辅助函数：验证 MongoDB ObjectId
function isValidObjectId(id: string) {
  return /^[0-9a-fA-F]{24}$/.test(id)
}

/**
 * GET /api/classes/[id]/problems - 获取班级题目列表
 */
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const user = getUserFromRequest(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: '未授权访问' },
        { status: 401 }
      )
    }

    const { id } = await context.params
    const classId = id

    if (!isValidObjectId(classId)) {
      return NextResponse.json(
        { success: false, error: '无效的班级ID' },
        { status: 400 }
      )
    }

    // 检查班级是否存在
    const classData = await prisma.class.findUnique({ where: { id: classId } })
    if (!classData) {
      return NextResponse.json(
        { success: false, error: '班级不存在' },
        { status: 404 }
      )
    }

    // 检查是否为班级成员
    const member = await prisma.classMember.findUnique({
      where: {
        classId_userId: {
          classId,
          userId: user.userId
        }
      }
    })

    if (!classData.isPublic && !member) {
      return NextResponse.json(
        { success: false, error: '无权访问该班级' },
        { status: 403 }
      )
    }

    // 获取 URL 参数
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')
    const difficulty = searchParams.get('difficulty')
    const search = searchParams.get('search')

    // 构建查询条件
    const where: Prisma.ProblemWhereInput = {
      classId: classId
    }

    if (difficulty) {
      where.difficulty = difficulty
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { tags: { has: search } }
      ]
    }

    // 获取题目列表
    const [problems, total] = await Promise.all([
      prisma.problem.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          author: {
            select: {
              username: true,
              nickname: true
            }
          }
        }
      }),
      prisma.problem.count({ where })
    ])

    return NextResponse.json({
      success: true,
      data: {
        problems: problems.map(p => ({
          id: p.id,
          title: p.title,
          problemNumber: p.problemNumber,
          difficulty: p.difficulty,
          tags: p.tags || [],
          acCount: p.totalAccepted,
          totalSubmissions: p.totalSubmit,
          acRate: p.totalSubmit > 0 ? Math.round((p.totalAccepted / p.totalSubmit) * 100) : 0,
          createdAt: p.createdAt,
          createdBy: p.authorId,
          authorName: p.author.nickname || p.author.username
        })),
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize)
        }
      }
    })
  } catch (error: any) {
    console.error('获取班级题目列表失败:', error)
    return NextResponse.json(
      { success: false, error: '获取班级题目列表失败' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/classes/[id]/problems - 添加题目到班级
 */
export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const user = getUserFromRequest(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: '未授权访问' },
        { status: 401 }
      )
    }

    const { id } = await context.params
    const classId = id

    if (!isValidObjectId(classId)) {
      return NextResponse.json(
        { success: false, error: '无效的班级ID' },
        { status: 400 }
      )
    }

    // 检查权限（只有管理员可以添加题目）
    const member = await prisma.classMember.findUnique({
      where: {
        classId_userId: {
          classId,
          userId: user.userId
        }
      }
    })

    if (!member || (member.role !== 'owner' && member.role !== 'assistant')) {
      return NextResponse.json(
        { success: false, error: '只有管理员可以添加题目' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { type, problemId, title, description, difficulty, tags, timeLimit, memoryLimit } = body

    // 自动生成题目编号
    const latestProblem = await prisma.problem.findFirst({
      where: { problemNumber: { startsWith: 'T' } }, // T for Class problem? Or just use P?
      // Use P for consistency, but maybe T to distinguish?
      // Or just generate Pxxxx like global problems.
      // Let's use T prefix for class private problems to avoid collision easily?
      // Or just next available P number.
      orderBy: { createdAt: 'desc' }, // problemNumber string sort might be wrong if length differs
      // Better to find global max.
    })
    
    // Simple random number for now to avoid collision
    const problemNumber = `T${Date.now().toString().slice(-6)}${Math.floor(Math.random()*100)}`

    if (type === 'existing') {
      // 从公共题库添加现有题目 (复制)
      if (!problemId) {
        return NextResponse.json(
          { success: false, error: '请提供题目ID' },
          { status: 400 }
        )
      }

      const existingProblem = await prisma.problem.findUnique({
        where: { id: problemId },
        include: { testCases: true }
      })

      if (!existingProblem) {
        return NextResponse.json(
          { success: false, error: '题目不存在' },
          { status: 404 }
        )
      }

      // 复制题目
      const newProblem = await prisma.problem.create({
        data: {
          problemNumber: problemNumber,
          classId,
          title: existingProblem.title,
          description: existingProblem.description,
          input: existingProblem.input,
          output: existingProblem.output,
          samples: existingProblem.samples || [],
          hint: existingProblem.hint,
          source: existingProblem.source,
          difficulty: existingProblem.difficulty,
          tags: existingProblem.tags,
          timeLimit: existingProblem.timeLimit,
          memoryLimit: existingProblem.memoryLimit,
          isPublic: false,
          authorId: user.userId,
          testCases: {
            create: existingProblem.testCases.map((tc, idx) => ({
              input: tc.input,
              output: tc.output,
              isSample: tc.isSample,
              score: tc.score,
              orderIndex: idx
            }))
          }
        }
      })

      return NextResponse.json({
        success: true,
        data: {
          id: newProblem.id
        },
        message: '题目已复制到班级'
      })

    } else if (type === 'new') {
      // 创建新题目
      if (!title || !description) {
        return NextResponse.json(
          { success: false, error: '请提供题目标题和描述' },
          { status: 400 }
        )
      }

      const newProblem = await prisma.problem.create({
        data: {
          problemNumber: problemNumber,
          classId,
          title,
          description,
          input: '',
          output: '',
          samples: [],
          difficulty: difficulty || 'Medium',
          tags: tags || [],
          timeLimit: timeLimit || 1000,
          memoryLimit: memoryLimit || 256,
          isPublic: false,
          authorId: user.userId
        }
      })

      return NextResponse.json({
        success: true,
        data: {
          id: newProblem.id
        },
        message: '题目创建成功'
      })
    } else {
      return NextResponse.json(
        { success: false, error: '无效的类型' },
        { status: 400 }
      )
    }
  } catch (error: any) {
    console.error('添加班级题目失败:', error)
    return NextResponse.json(
      { success: false, error: '添加班级题目失败' },
      { status: 500 }
    )
  }
}
