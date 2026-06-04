import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/problems/[id] - 获取题目详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    console.log('📥 获取题目详情, ID:', id)
    
    // 判断是 ObjectId 还是 problemNumber
    let problem
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      // 24位十六进制字符串，是 ObjectId
      problem = await prisma.problem.findUnique({
        where: { id },
        include: {
          author: {
            select: {
              id: true,
              username: true,
              nickname: true,
            },
          },
          testCases: {
            where: { isSample: true },
            orderBy: { orderIndex: 'asc' },
          },
        },
      })
    } else {
      // 不是 ObjectId，可能是 problemNumber（如 P1001）
      problem = await prisma.problem.findFirst({
        where: { problemNumber: id },
        include: {
          author: {
            select: {
              id: true,
              username: true,
              nickname: true,
            },
          },
          testCases: {
            where: { isSample: true },
            orderBy: { orderIndex: 'asc' },
          },
        },
      })
    }

    if (!problem) {
      return NextResponse.json(
        { success: false, error: '题目不存在' },
        { status: 404 }
      )
    }

    // 不返回非样例的测试用例及敏感的AI/标程字段
    const { 
      testCases, 
      aiStatus, 
      stdCode, 
      stdLang, 
      aiPrompt, 
      ...problemData 
    } = problem as any
    
    // 优先使用 samples 字段 (JSON)，如果没有则使用 testCases 中的样例
    let samples = problemData.samples
    if (!Array.isArray(samples) || samples.length === 0) {
      samples = testCases.map((tc: any) => ({
        input: tc.input,
        output: tc.output,
      }))
    }

    return NextResponse.json({
      success: true,
      data: {
        ...problemData,
        samples,
      },
    })
  } catch (error) {
    console.error('Error fetching problem:', error)
    return NextResponse.json(
      { success: false, error: '获取题目失败' },
      { status: 500 }
    )
  }
}
