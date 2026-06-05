import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { enqueueSolutionJob } from '@/lib/ai/solution-queue'

interface RouteContext {
  params: Promise<{
    id: string
  }>
}

function isValidObjectId(id: string) {
  return /^[0-9a-fA-F]{24}$/.test(id)
}

// POST /api/admin/problems/[id]/regenerate-solution
// 重新生成该题目的 AI 官方题解
export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params

    if (!isValidObjectId(id)) {
      return NextResponse.json(
        { success: false, error: '无效的题目 ID 格式' },
        { status: 400 }
      )
    }

    // 鉴权：必须登录
    const payload = getUserFromRequest(request)
    if (!payload) {
      return NextResponse.json(
        { success: false, error: '请先登录' },
        { status: 401 }
      )
    }

    // 校验管理员 / 教师
    const dbUser = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true, isAdmin: true, isBanned: true }
    })
    if (!dbUser || dbUser.isBanned) {
      return NextResponse.json(
        { success: false, error: '账号不可用' },
        { status: 403 }
      )
    }
    const isAdmin = dbUser.isAdmin === true || payload.isAdmin === true
    const isTeacher = dbUser.role === 'TEACHER'
    if (!isAdmin && !isTeacher) {
      return NextResponse.json(
        { success: false, error: '需要管理员或教师权限' },
        { status: 403 }
      )
    }

    // 读取题目
    const problem = await prisma.problem.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        description: true,
        input: true,
        output: true,
        samples: true,
        stdCode: true,
        stdLang: true,
        authorId: true
      }
    })
    if (!problem) {
      return NextResponse.json(
        { success: false, error: '题目不存在' },
        { status: 404 }
      )
    }

    // 删除原 AI_OFFICIAL 题解（保留同题的 USER 题解）
    const deleteResult = await prisma.solution.deleteMany({
      where: {
        problemId: id,
        sourceType: 'AI_OFFICIAL'
      } as any
    })

    // 拼装 description（复用 solution-generator 输入）
    const description = [
      problem.description || '',
      problem.input ? `\n\n## 输入格式\n${problem.input}` : '',
      problem.output ? `\n\n## 输出格式\n${problem.output}` : ''
    ].join('')

    // 入队新的 AI 题解生成
    const { logId } = await enqueueSolutionJob({
      problemId: problem.id,
      title: problem.title,
      description,
      stdCode: problem.stdCode || undefined,
      stdLang: problem.stdLang || undefined,
      authorId: problem.authorId,
      triggeredBy: payload.userId
    })

    logger.info('[admin/regenerate-solution] AI 题解重新生成任务已入队', {
      problemId: id,
      logId,
      operatorId: payload.userId,
      oldAiSolutionsDeleted: deleteResult.count
    })

    return NextResponse.json({
      success: true,
      data: { logId }
    })
  } catch (error: any) {
    logger.error('[admin/regenerate-solution] 重新生成 AI 题解失败', {
      error: error?.message,
      stack: error?.stack
    })
    return NextResponse.json(
      { success: false, error: '重新生成 AI 题解失败' },
      { status: 500 }
    )
  }
}
