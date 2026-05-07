import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { success, paginated, unauthorized, forbidden, notFound, error } from '@/lib/api-response'
import type { Prisma } from '@prisma/client'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    let page = parseInt(searchParams.get('page') || '1')
    let limit = parseInt(searchParams.get('limit') || '20')

    if (isNaN(page) || page < 1) page = 1
    if (isNaN(limit) || limit < 1) limit = 20
    if (limit > 50) limit = 50

    const keyword = searchParams.get('keyword')
    const difficulty = searchParams.get('difficulty')

    const where: Prisma.TrainingWhereInput = { isPublic: true }

    if (keyword) {
      where.OR = [
        { title: { contains: keyword, mode: 'insensitive' } },
        { description: { contains: keyword, mode: 'insensitive' } },
      ]
    }

    if (difficulty) {
      where.difficulty = difficulty
    }

    const [trainings, total] = await Promise.all([
      prisma.training.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              problems: true,
            },
          },
        },
      }),
      prisma.training.count({ where }),
    ])

    const trainingsWithStats = trainings.map(t => ({
      ...t,
      problemCount: t._count.problems,
    }))

    return paginated(trainingsWithStats, {
      page,
      pageSize: limit,
      total,
    })
  } catch (err) {
    logger.error('获取训练计划列表错误', err)
    return error('获取训练计划列表失败', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = getUserFromRequest(request)
    if (!currentUser) {
      return unauthorized('请先登录')
    }

    if (!currentUser.isAdmin) {
      return forbidden('只有管理员可以创建训练计划')
    }

    const body = await request.json()

    const { title, description, difficulty, isPublic, problemIds } = body

    if (!title || !description || !difficulty) {
      return error('缺少必要参数', 400)
    }

    const training = await prisma.training.create({
      data: {
        title,
        description,
        difficulty,
        isPublic: isPublic ?? true,
      },
    })

    if (problemIds && problemIds.length > 0) {
      const trainingProblems = problemIds.map((problemId: string, index: number) => ({
        trainingId: training.id,
        problemId,
        orderIndex: index,
      }))

      await prisma.trainingProblem.createMany({
        data: trainingProblems,
      })
    }

    return success(training, '训练计划创建成功')
  } catch (err) {
    logger.error('创建训练计划错误', err)
    return error('创建训练计划失败', 500)
  }
}
