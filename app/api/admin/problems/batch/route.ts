import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

interface BatchOperationRequest {
  action: 'publish' | 'unpublish' | 'delete' | 'contest'
  ids: string[]
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.isAdmin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 })
    }

    const body: BatchOperationRequest = await request.json()
    const { action, ids } = body

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ success: false, error: 'No IDs provided' }, { status: 400 })
    }

    let count = 0

    if (action === 'delete') {
      // For delete, we need to clean up related records first
      // This logic mirrors the single delete logic in [id]/route.ts
      
      // Use transaction for atomic deletion
      await prisma.$transaction(async (tx) => {
        // 1. Delete related records for ALL selected problems
        await tx.submission.deleteMany({ where: { problemId: { in: ids } } })
        await tx.solution.deleteMany({ where: { problemId: { in: ids } } })
        await tx.contestProblem.deleteMany({ where: { problemId: { in: ids } } })
        await tx.trainingProblem.deleteMany({ where: { problemId: { in: ids } } })
        await tx.favorite.deleteMany({ where: { problemId: { in: ids } } })
        await tx.testCase.deleteMany({ where: { problemId: { in: ids } } })
        
        // 2. Delete problems
        const result = await tx.problem.deleteMany({
          where: { id: { in: ids } }
        })
        count = result.count
      })
    } else {
      // Update operations (publish/unpublish/contest)
      const updateData: any = {}
      
      if (action === 'publish') {
        updateData.isPublic = true
        updateData.visibility = 'public'
      } else if (action === 'unpublish') {
        updateData.isPublic = false
        updateData.visibility = 'private'
      } else if (action === 'contest') {
        updateData.isPublic = false
        updateData.visibility = 'contest'
      }
      
      const result = await prisma.problem.updateMany({
        where: { id: { in: ids } },
        data: updateData
      })
      count = result.count
    }

    return NextResponse.json({ success: true, count, message: `Successfully processed ${count} items` })

  } catch (error: any) {
    console.error('Batch Operation Error:', error)
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
