import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'
import { compileCode, cleanup } from '@/lib/judge/compiler'
import { executeCode } from '@/lib/judge/executor'

interface RouteContext {
  params: Promise<{
    id: string
  }>
}

// POST /api/admin/problems/[id]/verify - 运行标程验证并纠正输出
export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  let compiledPath: string | null | undefined = null
  
  try {
    const { id } = await context.params
    const auth = await requireAdmin(request)
    if (!auth.isAdmin) {
      return NextResponse.json({ success: false, error: '需要管理员权限' }, { status: 403 })
    }

    const body = await request.json()
    const { solutionCode, solutionLanguage } = body

    if (!solutionCode || !solutionLanguage) {
      return NextResponse.json({ success: false, error: '请提供标程代码和语言' }, { status: 400 })
    }

    // 1. 获取题目和测试用例
    const problem = await prisma.problem.findUnique({
      where: { id },
      include: { testCases: { orderBy: { orderIndex: 'asc' } } }
    })

    if (!problem) {
      return NextResponse.json({ success: false, error: '题目不存在' }, { status: 404 })
    }

    if (problem.testCases.length === 0) {
      return NextResponse.json({ success: false, error: '题目没有测试用例，无法验证' }, { status: 400 })
    }

    // 2. 编译标程
    const compileResult = await compileCode(solutionCode, solutionLanguage)
    if (!compileResult.success) {
      return NextResponse.json({ 
        success: false, 
        error: '标程编译失败', 
        details: compileResult.error || compileResult.stderr 
      }, { status: 400 })
    }
    compiledPath = compileResult.compiledPath

    // 3. 运行测试用例
    const results: Array<{ id: string; status: string; time?: number; memory?: number; error?: string }> = []
    let passedCount = 0
    let failedCount = 0
    const updatedTestCases: Array<{ id: string; output: string }> = []

    for (const tc of problem.testCases) {
      try {
        const runResult = await executeCode({
          code: solutionCode,
          language: solutionLanguage,
          input: tc.input,
          timeLimit: problem.timeLimit * 2, // 给标程稍微宽裕一点的时间
          memoryLimit: problem.memoryLimit,
          compiledPath
        })

        if (runResult.exitCode === 0 && !runResult.timeout && !runResult.runtimeError) {
          // 运行成功，更新输出
          updatedTestCases.push({
            id: tc.id,
            output: runResult.output.trim()
          })
          passedCount++
          results.push({ id: tc.id, status: 'OK', time: runResult.time, memory: runResult.memory })
        } else {
          // 运行失败
          failedCount++
          results.push({ 
            id: tc.id, 
            status: 'FAILED', 
            error: runResult.error || (runResult.timeout ? 'Time Limit Exceeded' : 'Runtime Error') 
          })
        }
      } catch (err: any) {
        failedCount++
        results.push({ id: tc.id, status: 'ERROR', error: err.message })
      }
    }

    if (failedCount > 0) {
      // Log failure
      await prisma.verificationLog.create({
        data: {
            problemId: id,
            operatorId: auth.user!.userId,
            status: 'FAILED',
            details: {
                passed: passedCount,
                failed: failedCount,
                results: results
            }
        }
      })

      return NextResponse.json({
        success: false,
        error: `标程在 ${failedCount} 个测试点上运行失败，请检查标程或输入数据`,
        data: { results }
      })
    }

    // 4. 更新数据库
    await prisma.$transaction(async (tx) => {
        for (const tc of updatedTestCases) {
            await tx.testCase.update({
                where: { id: tc.id },
                data: { output: tc.output }
            })
        }
        
        // 更新题目状态
        await tx.problem.update({
            where: { id },
            data: {
                stdCode: solutionCode,
                stdLang: solutionLanguage,
            }
        })
        
        // Log Success
        await tx.verificationLog.create({
            data: {
                problemId: id,
                operatorId: auth.user!.userId,
                status: 'SUCCESS',
                details: {
                    passed: passedCount,
                    failed: 0,
                    results: results,
                    fixedCount: updatedTestCases.length
                }
            }
        })
    })

    return NextResponse.json({
      success: true,
      message: `验证通过，已更新 ${passedCount} 个测试点的输出数据`,
      data: { results }
    })

  } catch (error: any) {
    console.error('Verify Error:', error)
    return NextResponse.json({ success: false, error: '服务器错误: ' + error.message }, { status: 500 })
  } finally {
    if (compiledPath) {
      await cleanup(compiledPath)
    }
  }
}
