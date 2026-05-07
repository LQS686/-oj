/**
 * 获取用户对题目的完成状态
 * GET /api/problems/status?problemIds=id1,id2,id3
 */

import { NextRequest, NextResponse } from 'next/server'
import { prismaRo } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  try {
    const user = getUserFromRequest(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: '未授权访问' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const problemIdsParam = searchParams.get('problemIds')
    
    if (!problemIdsParam) {
      return NextResponse.json(
        { success: true, data: {} }
      )
    }

    const problemIds = problemIdsParam.split(',').filter(id => id.trim())
    
    if (problemIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: {}
      })
    }

    const userId = user.userId

    const [submissions, teamSubmissions] = await Promise.all([
      prismaRo.submission.findMany({
        where: {
          userId: userId,
          problemId: { in: problemIds }
        },
        select: {
          problemId: true,
          score: true
        }
      }),
      prismaRo.teamAssignmentSubmission.findMany({
        where: {
          userId: userId,
          problemId: { in: problemIds }
        },
        select: {
          problemId: true,
          score: true
        }
      })
    ])

    const allSubmissions = [...submissions, ...teamSubmissions]

    const problemStatus: { [problemId: string]: { score: number, submitted: boolean } } = {}
    
    problemIds.forEach((problemId) => {
      const problemSubmissions = allSubmissions.filter(
        s => s.problemId === problemId
      )
      
      if (problemSubmissions.length > 0) {
        const maxScore = Math.max(...problemSubmissions.map(s => s.score || 0))
        problemStatus[problemId] = {
          score: maxScore,
          submitted: true
        }
      } else {
        problemStatus[problemId] = {
          score: 0,
          submitted: false
        }
      }
    })

    return NextResponse.json({
      success: true,
      data: problemStatus
    })
  } catch (error: any) {
    logger.error('获取题目状态失败:', error)
    return NextResponse.json(
      { success: false, error: '获取题目状态失败' },
      { status: 500 }
    )
  }
}
