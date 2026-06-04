import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.isAdmin) {
      return NextResponse.json({ success: false, error: '需要管理员权限' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const source = searchParams.get('source') || 'all'

    const where: any = {}
    if (source !== 'all') {
      where.aiStatus = source
    }

    const problems = await prisma.problem.findMany({
      where,
      select: {
        id: true,
        title: true,
        aiStatus: true,
        createdAt: true,
        updatedAt: true,
        totalSubmit: true,
        totalAccepted: true
      },
      orderBy: { createdAt: 'desc' }
    })

    // Generate CSV
    const headers = ['ID', 'Title', 'Source', 'Created At', 'Updated At', 'Submissions', 'Accepted']
    const rows = problems.map(p => [
      p.id,
      p.title,
      p.aiStatus,
      p.createdAt.toISOString(),
      p.updatedAt.toISOString(),
      p.totalSubmit,
      p.totalAccepted
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    ].join('\n')

    // Return as download
    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="problems_report_${source}_${new Date().toISOString().split('T')[0]}.csv"`
      }
    })

  } catch (error: any) {
    return NextResponse.json({ success: false, error: '服务器错误: ' + error.message }, { status: 500 })
  }
}
