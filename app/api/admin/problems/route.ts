import { NextRequest, NextResponse } from 'next/server'
import { prisma, Prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import {
  validateRequired,
  validateProblemTitle,
  validateProblemDescription,
  validateDifficulty,
  validateTimeLimit,
  validateMemoryLimit,
  validateTags,
  validateTestCases,
} from '@/lib/validation'
import { trimAll, escapeHtml } from '@/lib/sanitize'
import { redistributeTestScores } from '@/lib/testcase-score'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.isAdmin) {
      return NextResponse.json(
        { success: false, error: auth.error || '需要管理员权限' },
        { status: 403 }
      )
    }

    const problems = await prisma.problem.findMany({
      orderBy: [
        { problemNumber: 'asc' },
        { createdAt: 'desc' }
      ],
      select: {
        id: true,
        problemNumber: true,
        title: true,
        description: true,
        input: true,
        output: true,
        samples: true,
        hint: true,
        source: true,
        difficulty: true,
        tags: true,
        isPublic: true,
        visibility: true,
        timeLimit: true,
        memoryLimit: true,
        totalSubmit: true,
        totalAccepted: true,
        createdAt: true,
        updatedAt: true,
        isAiGenerated: true,
        aiStatus: true,
      }
    })

    return NextResponse.json({
      success: true,
      data: problems
    })
  } catch (error) {
    console.error('获取题目列表失败:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('📥 收到创建题目请求')

    const auth = await requireAdmin(request)
    if (!auth.isAdmin || !auth.user) {
      console.error('❌ 权限验证失败')
      return NextResponse.json(
        { success: false, error: auth.error || '需要管理员权限' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const trimmedBody = trimAll(body)
    const {
      problemNumber,
      title,
      description,
      input,
      output,
      samples,
      hint,
      source,
      difficulty,
      tags,
      timeLimit,
      memoryLimit,
      isPublic,
      visibility,
      testCases
    } = trimmedBody

    console.log('📊 题目信息:', { title, difficulty, testCasesCount: (testCases as unknown[])?.length || 0 })

    const requiredError = validateRequired(trimmedBody, ['title', 'description', 'difficulty'])
    if (requiredError) {
      console.error('❌ 缺少必填字段:', requiredError)
      return NextResponse.json(
        { success: false, error: requiredError },
        { status: 400 }
      )
    }

    if (!validateProblemTitle(title as string)) {
      return NextResponse.json(
        { success: false, error: '题目标题长度必须在1-200个字符之间' },
        { status: 400 }
      )
    }

    if (!validateProblemDescription(description as string)) {
      return NextResponse.json(
        { success: false, error: '题目描述至少需要10个字符' },
        { status: 400 }
      )
    }

    if (!validateDifficulty(difficulty as string)) {
      return NextResponse.json(
        { success: false, error: '难度值无效，必须是：简单、中等、困难' },
        { status: 400 }
      )
    }

    if (timeLimit !== undefined && timeLimit !== null) {
      const timeLimitNum = typeof timeLimit === 'string' ? parseInt(timeLimit, 10) : timeLimit
      if (!validateTimeLimit(timeLimitNum as number)) {
        return NextResponse.json(
          { success: false, error: '时间限制必须在1-30000ms之间' },
          { status: 400 }
        )
      }
    }

    if (memoryLimit !== undefined && memoryLimit !== null) {
      const memoryLimitNum = typeof memoryLimit === 'string' ? parseInt(memoryLimit, 10) : memoryLimit
      if (!validateMemoryLimit(memoryLimitNum as number)) {
        return NextResponse.json(
          { success: false, error: '内存限制必须在1-1024MB之间' },
          { status: 400 }
        )
      }
    }

    if (tags !== undefined && tags !== null && !validateTags(tags)) {
      return NextResponse.json(
        { success: false, error: '标签格式无效，每个标签必须是1-50个字符' },
        { status: 400 }
      )
    }

    if (testCases !== undefined && testCases !== null) {
      const testCasesValidation = validateTestCases(testCases)
      if (!testCasesValidation.valid) {
        return NextResponse.json(
          { success: false, error: testCasesValidation.errors.join('；') },
          { status: 400 }
        )
      }
    }

    const sanitizedTitle = escapeHtml(title as string)
    const sanitizedDescription = description as string
    const sanitizedInput = input ? (input as string) : ''
    const sanitizedOutput = output ? (output as string) : ''
    const sanitizedHint = hint ? escapeHtml(hint as string) : null
    const sanitizedSource = source ? escapeHtml(source as string) : null

    let finalProblemNumber = problemNumber as string | undefined

    if (!finalProblemNumber) {
      console.log('🔢 未提供题目编号，开始自动生成...')

      const latestProblem = await prisma.problem.findFirst({
        where: {
          problemNumber: {
            startsWith: 'P'
          }
        },
        orderBy: {
          problemNumber: 'desc'
        },
        select: {
          problemNumber: true
        }
      })

      let nextNumber = 1001

      if (latestProblem?.problemNumber) {
        const match = latestProblem.problemNumber.match(/^P(\d+)$/)
        if (match) {
          const currentNumber = parseInt(match[1], 10)
          nextNumber = currentNumber + 1
        }
      }

      finalProblemNumber = `P${nextNumber}`
      console.log('✅ 生成题目编号:', finalProblemNumber)
    } else {
      const existing = await prisma.problem.findUnique({
        where: { problemNumber: finalProblemNumber }
      })
      if (existing) {
        console.error('❌ 题目编号已存在:', finalProblemNumber)
        return NextResponse.json(
          { success: false, error: '题目编号已存在' },
          { status: 400 }
        )
      }
    }

    console.log('💾 使用 Prisma 创建题目...')

    const timeLimitValue: number = typeof timeLimit === 'string' ? parseInt(timeLimit, 10) : (typeof timeLimit === 'number' ? timeLimit : 1000)
    const memoryLimitValue: number = typeof memoryLimit === 'string' ? parseInt(memoryLimit, 10) : (typeof memoryLimit === 'number' ? memoryLimit : 128)

    const problemData: Prisma.ProblemCreateInput = {
      problemNumber: finalProblemNumber,
      title: sanitizedTitle,
      description: sanitizedDescription,
      input: sanitizedInput,
      output: sanitizedOutput,
      samples: samples || [],
      hint: sanitizedHint,
      source: sanitizedSource,
      difficulty: difficulty as string,
      tags: (tags as string[]) || [],
      timeLimit: timeLimitValue,
      memoryLimit: memoryLimitValue,
      isPublic: visibility === 'public',
      visibility: (visibility as string) || 'public',
      totalSubmit: 0,
      totalAccepted: 0,
      author: {
        connect: { id: auth.user.userId }
      },
    }

    if (testCases && Array.isArray(testCases) && testCases.length > 0) {
      console.log('📝 创建', testCases.length, '个测试用例...')
      problemData.testCases = {
        create: testCases.map((tc: Record<string, unknown>, idx: number) => ({
          input: String(tc.input || ''),
          output: String(tc.output || ''),
          isSample: Boolean(tc.isSample),
          score: Number(tc.score) || 10,
          orderIndex: idx,
        }))
      }
    }

    const problem = await prisma.problem.create({
      data: problemData as Prisma.ProblemCreateInput,
      include: {
        testCases: true
      }
    })

    if (problem.testCases && problem.testCases.length > 0) {
      await redistributeTestScores(problem.id)
    }

    console.log('✅ 题目创建成功, ID:', problem.id)

    return NextResponse.json({
      success: true,
      data: problem,
      message: '题目创建成功'
    })
  } catch (error) {
    console.error('💥 创建题目失败:', error)
    if (error instanceof Error) {
      console.error('💥 错误消息:', error.message)
      console.error('💥 错误堆栈:', error.stack)
    }
    return NextResponse.json(
      {
        success: false,
        error: '服务器错误',
        details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined
      },
      { status: 500 }
    )
  }
}
