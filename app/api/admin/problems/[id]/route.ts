import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'
import { redistributeTestScores } from '@/lib/testcase-score'

interface RouteContext {
  params: Promise<{
    id: string
  }>
}

// 辅助函数：验证 MongoDB ObjectId
function isValidObjectId(id: string) {
  return /^[0-9a-fA-F]{24}$/.test(id)
}

// GET /api/admin/problems/[id] - 获取题目详情（管理员）
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    console.log('📥 收到获取题目详情请求')
    const { id } = await context.params
    console.log('📊 题目 ID:', id)

    // 验证管理员权限
    const auth = await requireAdmin(request)
    if (!auth.isAdmin) {
      console.error('❌ 权限验证失败')
      return NextResponse.json(
        { success: false, error: auth.error || '需要管理员权限' },
        { status: 403 }
      )
    }

    // 验证 ObjectId 格式
    if (!isValidObjectId(id)) {
      console.error('❌ 无效的 ObjectId 格式:', id)
      return NextResponse.json(
        { success: false, error: '无效的题目 ID 格式' },
        { status: 400 }
      )
    }

    // 获取题目详情
    const problem = await prisma.problem.findUnique({
      where: { id },
      include: {
        testCases: {
          orderBy: { orderIndex: 'asc' }
        },
        author: {
          select: {
            username: true,
            nickname: true
          }
        }
      }
    })

    if (!problem) {
      console.error('❌ 题目不存在:', id)
      return NextResponse.json(
        { success: false, error: '题目不存在' },
        { status: 404 }
      )
    }

    console.log('✅ 题目详情获取成功')

    return NextResponse.json({
      success: true,
      data: problem
    })
  } catch (error: any) {
    console.error('💥 获取题目详情失败:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}

// PATCH /api/admin/problems/[id] - 更新题目（管理员）
export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  return handleUpdate(request, context)
}

// PUT /api/admin/problems/[id] - 更新题目（管理员）
export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  return handleUpdate(request, context)
}

async function handleUpdate(
  request: NextRequest,
  context: RouteContext
) {
  try {
    console.log('📥 收到更新题目请求')
    const { id } = await context.params
    console.log('📊 题目 ID:', id)

    // 验证管理员权限
    const auth = await requireAdmin(request)
    if (!auth.isAdmin) {
      console.error('❌ 权限验证失败')
      return NextResponse.json(
        { success: false, error: auth.error || '需要管理员权限' },
        { status: 403 }
      )
    }

    // 验证 ObjectId 格式
    if (!isValidObjectId(id)) {
      console.error('❌ 无效的 ObjectId 格式:', id)
      return NextResponse.json(
        { success: false, error: '无效的题目 ID 格式' },
        { status: 400 }
      )
    }

    const body = await request.json()
    console.log('📊 更新信息:', { id, updateFields: Object.keys(body), hasTestCases: !!body.testCases })

    // 检查题目是否存在
    const existingProblem = await prisma.problem.findUnique({
      where: { id }
    })

    if (!existingProblem) {
      return NextResponse.json(
        { success: false, error: '题目不存在' },
        { status: 404 }
      )
    }

    // 如果更新题目编号，检查是否重复
    if (body.problemNumber && body.problemNumber !== existingProblem.problemNumber) {
      const duplicate = await prisma.problem.findUnique({
        where: { problemNumber: body.problemNumber }
      })
      if (duplicate) {
        return NextResponse.json(
          { success: false, error: '题目编号已存在' },
          { status: 400 }
        )
      }
    }

    // 准备更新数据
    const updateData: any = {}
    const allowedFields = [
      'problemNumber', 'title', 'description', 'input', 'output',
      'samples', 'hint', 'source', 'difficulty', 'tags',
      'timeLimit', 'memoryLimit', 'isPublic', 'visibility'
    ]

    allowedFields.forEach(field => {
      if (field in body) {
        updateData[field] = body[field]
      }
    })

    // Sync visibility and isPublic if visibility is present
    if (updateData.visibility) {
      updateData.isPublic = updateData.visibility === 'public'
    } else if (updateData.isPublic !== undefined) {
      updateData.visibility = updateData.isPublic ? 'public' : 'private'
    }

    // 如果提供了测试用例更新
    // Prisma 的 update 可以处理关联数据的 create/delete/update
    // 但完全替换（deleteMany + createMany）在嵌套 update 中可能不支持直接 deleteMany
    // 我们可以分步执行，或者使用事务

    // 使用事务确保原子性（如果支持）或者顺序执行
    // 考虑到兼容性，我们顺序执行
    
    // 1. 更新题目基本信息
    await prisma.problem.update({
      where: { id },
      data: updateData
    })

    // 2. 更新测试用例
    if (body.testCases && Array.isArray(body.testCases)) {
      console.log('📝 更新测试用例...')
      
      // 删除旧的测试用例
      await prisma.testCase.deleteMany({
        where: { problemId: id }
      })

      // 创建新的测试用例
      if (body.testCases.length > 0) {
        await prisma.testCase.createMany({
          data: body.testCases.map((tc: any, idx: number) => ({
            problemId: id,
            input: tc.input || '',
            output: tc.output || '',
            isSample: tc.isSample || false,
            score: tc.score || 10,
            orderIndex: idx
          }))
        })
      }
      console.log('✅ 测试用例已更新')
    }

    // 3. 如果测试用例有变化，重新分配分数
    if (body.testCases && Array.isArray(body.testCases) && body.testCases.length > 0) {
      await redistributeTestScores(id)
    }

    // 获取更新后的题目
    const updatedProblem = await prisma.problem.findUnique({
      where: { id },
      include: {
        testCases: { orderBy: { orderIndex: 'asc' } }
      }
    })

    return NextResponse.json({
      success: true,
      data: updatedProblem,
      message: '题目更新成功'
    })
  } catch (error: any) {
    console.error('💥 更新题目失败:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}

// DELETE /api/admin/problems/[id] - 删除题目（管理员）
export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    console.log('📥 收到删除题目请求')
    const { id } = await context.params
    console.log('📊 题目 ID:', id)

    // 验证管理员权限
    const auth = await requireAdmin(request)
    if (!auth.isAdmin) {
      console.error('❌ 权限验证失败')
      return NextResponse.json(
        { success: false, error: auth.error || '需要管理员权限' },
        { status: 403 }
      )
    }

    // 验证 ObjectId 格式
    if (!isValidObjectId(id)) {
      console.error('❌ 无效的 ObjectId 格式:', id)
      return NextResponse.json(
        { success: false, error: '无效的题目 ID 格式' },
        { status: 400 }
      )
    }

    // 检查题目是否存在
    const problem = await prisma.problem.findUnique({
      where: { id }
    })

    if (!problem) {
      return NextResponse.json(
        { success: false, error: '题目不存在' },
        { status: 404 }
      )
    }

    console.log('🗑️ 删除题目及相关数据...')
    
    // Prisma 配置了 onDelete: Cascade (在 schema 中 TestCase 关联 Problem)
    // 所以只需要删除 Problem，TestCase 会自动删除 (如果 Prisma Client 能够处理)
    // 但是 MongoDB connector 的 referential actions 支持有限，最好显式删除
    
    // 显式删除相关数据，解决外键约束问题
    console.log('📝 删除相关提交记录...')
    await prisma.submission.deleteMany({
      where: { problemId: id }
    })

    console.log('📝 删除相关题解...')
    await prisma.solution.deleteMany({
      where: { problemId: id }
    })

    console.log('📝 删除相关竞赛题目关联...')
    await prisma.contestProblem.deleteMany({
      where: { problemId: id }
    })

    console.log('📝 删除相关训练题目关联...')
    await prisma.trainingProblem.deleteMany({
      where: { problemId: id }
    })

    console.log('📝 删除相关收藏记录...')
    await prisma.favorite.deleteMany({
      where: { problemId: id }
    })

    console.log('📝 删除测试用例...')
    await prisma.testCase.deleteMany({
      where: { problemId: id }
    })
    
    // 删除题目
    await prisma.problem.delete({
      where: { id }
    })

    console.log('✅ 题目已删除')

    return NextResponse.json({
      success: true,
      message: '题目已删除'
    })
  } catch (error: any) {
    console.error('💥 删除题目失败:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}
