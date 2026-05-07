import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.isAdmin) {
      return NextResponse.json({ success: false, error: '需要管理员权限' }, { status: 403 })
    }

    const { ids, source } = await request.json()

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ success: false, error: '未选择题目' }, { status: 400 })
    }

    if (!['MANUAL_CREATED', 'AI_ASSISTED', 'AI_GENERATED'].includes(source)) {
      return NextResponse.json({ success: false, error: '无效的来源标记' }, { status: 400 })
    }

    // Update
    const result = await prisma.problem.updateMany({
      where: {
        id: { in: ids }
      },
      data: {
        aiStatus: source,
        // If switching to AI_GENERATED, we might want to ensure verification is required if it wasn't before.
        // But for now, just updating the tag.
      }
    })

    // Create Audit Log
    await prisma.auditLog.create({
      data: {
        userId: auth.user!.userId,
        action: 'UPDATE_PROBLEM_SOURCE',
        resource: 'problems',
        details: {
            count: result.count,
            targetSource: source,
            problemIds: ids
        },
        ip: request.headers.get('x-forwarded-for') || 'unknown'
      }
    })

    return NextResponse.json({
      success: true,
      message: `成功更新 ${result.count} 个题目的来源标记`
    })

  } catch (error: any) {
    return NextResponse.json({ success: false, error: '服务器错误: ' + error.message }, { status: 500 })
  }
}
