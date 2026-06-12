/**
 * 获取当前用户在作业中的题目完成进度
 * GET /api/classes/[id]/assignments/[assignmentId]/my-progress
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'

interface RouteContext {
  params: Promise<{ id: string; assignmentId: string }>
}

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

    const { id, assignmentId } = await context.params
    const classId = id
    const userId = user.userId

    // 检查是否为班级成员
    const member = await prisma.classMember.findUnique({
      where: {
        classId_userId: {
          classId,
          userId
        }
      }
    })

    if (!member) {
      return NextResponse.json(
        { success: false, error: '只有班级成员可以查看进度' },
        { status: 403 }
      )
    }

    // 获取作业信息
    const assignment = await prisma.classAssignment.findUnique({
      where: {
        id: assignmentId,
        classId
      }
    })

    if (!assignment) {
      return NextResponse.json(
        { success: false, error: '作业不存在' },
        { status: 404 }
      )
    }

    // ✅ 【数据隔离】获取该用户在当前作业中的所有提交记录
    // 重要：必须同时筛选 assignmentId 和 userId，确保数据仅来源于当前作业
    const submissions = await prisma.classAssignmentSubmission.findMany({
      where: {
        assignmentId,
        userId
      }
    })

    console.log(`[DataIsolation] 作业进度查询 - 作业ID: ${assignmentId}, 用户ID: ${userId}, 提交记录数: ${submissions.length}`)

    // 构建题目得分映射
    const problemScores: { [problemId: string]: { score: number, submitted: boolean } } = {}
    
    // ✅ 【数据隔离】为每道题目计算最高分
    assignment.problemIds.forEach((problemId) => {
      const problemSubmissions = submissions.filter(
        s => s.problemId === problemId
      )
      
      if (problemSubmissions.length > 0) {
        const maxScore = Math.max(...problemSubmissions.map(s => s.score || 0))
        problemScores[problemId] = {
          score: maxScore,
          submitted: true
        }
      } else {
        problemScores[problemId] = {
          score: 0,
          submitted: false
        }
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        problemScores,
        totalSubmissions: submissions.length
      }
    })
  } catch (error: any) {
    console.error('获取进度失败:', error)
    return NextResponse.json(
      { success: false, error: '获取进度失败' },
      { status: 500 }
    )
  }
}
