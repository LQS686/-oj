import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'

// GET /api/admin/dashboard - 获取仪表盘数据
export async function GET(request: NextRequest) {
  try {
    // 验证管理员权限
    const auth = await requireAdmin(request)
    
    if (!auth.isAdmin) {
      return NextResponse.json(
        { success: false, error: auth.error || '需要管理员权限' },
        { status: 403 }
      )
    }

    // 获取统计数据
    const [
      totalUsers,
      totalProblems,
      totalSubmissions,
      recentSubmissionsRaw
    ] = await Promise.all([
      // 总用户数
      prisma.user.count(),
      
      // 总题目数
      prisma.problem.count(),
      
      // 总提交数
      prisma.submission.count(),
      
      // 最近10条提交记录（不使用 include，手动查询）
      prisma.submission.findMany({
        take: 10,
        orderBy: { submittedAt: 'desc' },
        select: {
          id: true,
          userId: true,
          problemId: true,
          status: true,
          submittedAt: true
        }
      })
    ])

    // ✅ 手动查询用户和题目信息
    const recentSubmissions = await Promise.all(
      recentSubmissionsRaw.map(async (sub) => {
        const [user, problem] = await Promise.all([
          prisma.user.findUnique({
            where: { id: sub.userId },
            select: { username: true, nickname: true }
          }),
          prisma.problem.findUnique({
            where: { id: sub.problemId },
            select: { title: true, problemNumber: true }
          })
        ])
        
        return {
          id: sub.id,
          user: {
            username: user?.nickname || user?.username || '未知用户'
          },
          problem: {
            title: problem?.title || '题目已删除',
            problemNumber: problem?.problemNumber || ''
          },
          status: sub.status,
          submittedAt: sub.submittedAt
        }
      })
    )

    // 计算今日提交数
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const todaySubmissions = await prisma.submission.count({
      where: {
        submittedAt: {
          gte: today
        }
      }
    })

    // 计算本周新增用户（简化版，实际应该更精确）
    const lastWeek = new Date()
    lastWeek.setDate(lastWeek.getDate() - 7)
    
    const newUsersThisWeek = await prisma.user.count({
      where: {
        createdAt: {
          gte: lastWeek
        }
      }
    })

    const newSubmissionsThisWeek = await prisma.submission.count({
      where: {
        submittedAt: {
          gte: lastWeek
        }
      }
    })

    // 计算增长率
    const userGrowth = totalUsers > 0 ? ((newUsersThisWeek / totalUsers) * 100).toFixed(1) : 0
    const submissionGrowth = totalSubmissions > 0 ? ((newSubmissionsThisWeek / totalSubmissions) * 100).toFixed(1) : 0

    return NextResponse.json({
      success: true,
      data: {
        totalUsers,
        totalProblems,
        totalSubmissions,
        todaySubmissions,
        userGrowth: parseFloat(userGrowth.toString()),
        submissionGrowth: parseFloat(submissionGrowth.toString()),
        recentSubmissions  // ✅ 直接使用已经处理好的数据
      }
    })
  } catch (error) {
    console.error('获取仪表盘数据失败:', error)
    return NextResponse.json(
      { success: false, error: '获取数据失败' },
      { status: 500 }
    )
  }
}
