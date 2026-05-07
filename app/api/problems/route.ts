import { NextRequest, NextResponse } from 'next/server'
import { prisma, prismaRo } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { logger } from '@/lib/logger'
import type { ProblemWhereInput, TestCaseInput } from '@/types/api'
import type { Prisma } from '@prisma/client'
import { errorHandler } from '@/lib/error-handler'
import { errorMonitor } from '@/lib/error-monitor'
import { success, badRequest, forbidden, created, internalError } from '@/lib/api-response'

// 模拟数据
const mockProblems = [
  {
    id: '1',
    problemNumber: 'P1001',
    title: 'A+B Problem',
    difficulty: '入门',
    tags: ['模拟', '入门'],
    totalSubmit: 10000,
    totalAccepted: 8000,
    createdAt: new Date('2024-01-01'),
  },
  {
    id: '2',
    problemNumber: 'P1002',
    title: '过河卒',
    difficulty: '普及-',
    tags: ['动态规划', '递推'],
    totalSubmit: 8000,
    totalAccepted: 5000,
    createdAt: new Date('2024-01-02'),
  },
  {
    id: '3',
    problemNumber: 'P1003',
    title: '铺地毯',
    difficulty: '普及',
    tags: ['模拟', '枚举'],
    totalSubmit: 7000,
    totalAccepted: 4500,
    createdAt: new Date('2024-01-03'),
  },
  {
    id: '4',
    problemNumber: 'P1004',
    title: '方格取数',
    difficulty: '普及+',
    tags: ['动态规划', '递归'],
    totalSubmit: 6000,
    totalAccepted: 3500,
    createdAt: new Date('2024-01-04'),
  },
  {
    id: '5',
    problemNumber: 'P1005',
    title: '最长上升子序列',
    difficulty: '提高',
    tags: ['动态规划', '二分'],
    totalSubmit: 5000,
    totalAccepted: 2500,
    createdAt: new Date('2024-01-05'),
  },
]

// GET /api/problems - 获取题目列表 (Read Only)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    let page = parseInt(searchParams.get('page') || '1')
    let limit = parseInt(searchParams.get('limit') || '20')
    
    if (isNaN(page) || page < 1) page = 1
    if (isNaN(limit) || limit < 1) limit = 20
    if (limit > 50) limit = 50
    
    const difficulty = searchParams.get('difficulty')
    const tag = searchParams.get('tag')
    const search = searchParams.get('search')
    const numbers = searchParams.get('numbers') // Support batch lookup by problem numbers

    // 构建查询条件
    const where: Prisma.ProblemWhereInput = { 
      isPublic: true,
    }
    
    if (difficulty && difficulty !== '全部') {
      where.difficulty = difficulty
    }
    
    if (tag && tag !== '全部') {
      where.tags = { has: tag }
    }
    
    if (numbers) {
      // Batch lookup
      const numList = numbers.split(',').map(n => n.trim()).filter(Boolean)
      if (numList.length > 0) {
        where.problemNumber = { in: numList }
      }
    } else if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { problemNumber: { contains: search, mode: 'insensitive' } },
      ]
    }

    // 尝试从数据库获取数据
    try {
      // 查询题目和总数 - 使用 prismaRo 进行读操作
      // 注意：prismaRo 配置了 ReadPreference=secondaryPreferred
      const [problems, total] = await Promise.all([
        prismaRo.problem.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            problemNumber: true,
            title: true,
            difficulty: true,
            tags: true,
            totalSubmit: true,
            totalAccepted: true,
            createdAt: true,
          },
        }),
        prismaRo.problem.count({ where }),
      ])

      return success({
        problems,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      })
    } catch (dbError) {
      // 数据库连接失败，使用模拟数据
      logger.warn('数据库连接失败，使用模拟数据', dbError)
      
      // 过滤模拟数据
      let filteredProblems = [...mockProblems]
      
      if (difficulty && difficulty !== '全部') {
        filteredProblems = filteredProblems.filter(p => p.difficulty === difficulty)
      }
      
      if (tag && tag !== '全部') {
        filteredProblems = filteredProblems.filter(p => p.tags.includes(tag))
      }
      
      if (search) {
        const searchLower = search.toLowerCase()
        filteredProblems = filteredProblems.filter(p => 
          p.title.toLowerCase().includes(searchLower) ||
          p.problemNumber.toLowerCase().includes(searchLower)
        )
      }
      
      if (numbers) {
        const numList = numbers.split(',').map(n => n.trim()).filter(Boolean)
        if (numList.length > 0) {
          filteredProblems = filteredProblems.filter(p => numList.includes(p.problemNumber))
        }
      }
      
      // 分页
      const total = filteredProblems.length
      const start = (page - 1) * limit
      const end = start + limit
      const paginatedProblems = filteredProblems.slice(start, end)
      
      return success({
        problems: paginatedProblems,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      })
    }
  } catch (error) {
    logger.error('Error fetching problems', error)
    await errorMonitor.trackError(error instanceof Error ? error : String(error), { errorType: 'problem', endpoint: '/api/problems' })
    return errorHandler.handle(error, request)
  }
}


// POST /api/problems - 创建题目（需要管理员权限）
export async function POST(request: NextRequest) {
  try {
    // 验证用户权限
    const currentUser = getUserFromRequest(request)
    if (!currentUser || !currentUser.isAdmin) {
      return forbidden('需要管理员权限')
    }

    const body = await request.json()
    
    // 验证必需字段
    const requiredFields = ['title', 'description', 'input', 'output', 'difficulty']
    for (const field of requiredFields) {
      if (!body[field]) {
        return badRequest(`缺少必需字段: ${field}`)
      }
    }

    // 创建题目
    const problem = await prisma.problem.create({
      data: {
        title: body.title,
        description: body.description,
        input: body.input,
        output: body.output,
        samples: body.samples || [],
        hint: body.hint,
        source: body.source,
        difficulty: body.difficulty,
        tags: body.tags || [],
        timeLimit: body.timeLimit || 1000,
        memoryLimit: body.memoryLimit || 128,
        isPublic: body.isPublic ?? false,
        authorId: currentUser.userId,
      },
    })

    // 创建测试用例
    if (body.testCases && Array.isArray(body.testCases)) {
      await Promise.all(
        body.testCases.map((testCase: TestCaseInput, index: number) =>
          prisma.testCase.create({
            data: {
              problemId: problem.id,
              input: testCase.input,
              output: testCase.output,
              isSample: testCase.isSample || false,
              score: testCase.score || 10,
              orderIndex: index + 1,
            },
          })
        )
      )
    }

    return created(problem, '题目创建成功')
  } catch (error) {
    logger.error('Error creating problem', error)
    await errorMonitor.trackError(error instanceof Error ? error : String(error), { errorType: 'problem', endpoint: '/api/problems' })
    return errorHandler.handle(error, request)
  }
}
