/**
 * /api/admin/problems/[id]/verify - 标程验证并自动修复输出
 *
 * 流程：
 *  1. 编译标程
 *  2. 跑完所有测试点
 *  3. 成功：用真实输出覆盖 TestCase.output
 *  4. 失败：仅记录 VerificationLog，不修改
 */
import { withApi, ok, readJson, throw400, throw403, throw404, throw500 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { prisma } from '@/lib/prisma'
import { compileCode, cleanup } from '@/lib/judge/compiler'
import { executeCode } from '@/lib/judge/executor'

export const POST = withApi.auth(async (req, ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的题目 ID')

  const body = await readJson<{ solutionCode?: string; solutionLanguage?: string }>(req)
  const { solutionCode, solutionLanguage } = body

  if (!solutionCode || !solutionLanguage) {
    throw400('MISSING_FIELDS', '请提供标程代码和语言')
  }

  // 1. 获取题目和测试用例
  const problem = await prisma.problem.findUnique({
    where: { id },
    include: { testCases: { orderBy: { orderIndex: 'asc' } } },
  })
  if (!problem) throw404('题目不存在')
  if (problem!.testCases.length === 0) {
    throw400('NO_TEST_CASES', '题目没有测试用例，无法验证')
  }

  // 2. 编译标程
  const compileResult = await compileCode(solutionCode!, solutionLanguage!)
  if (!compileResult.success) {
    return ok({
      success: false,
      error: '标程编译失败',
      details: compileResult.error || compileResult.stderr,
    })
  }
  const compiledPath = compileResult.compiledPath

  // 3. 运行测试用例
  const results: Array<{ id: string; status: string; time?: number; memory?: number; error?: string }> = []
  let passedCount = 0
  let failedCount = 0
  const updatedTestCases: Array<{ id: string; output: string }> = []

  try {
    for (const tc of problem!.testCases) {
      try {
        const runResult = await executeCode({
          code: solutionCode!,
          language: solutionLanguage!,
          input: tc.input,
          timeLimit: problem!.timeLimit * 2, // 给标程稍微宽裕一点的时间
          memoryLimit: problem!.memoryLimit,
          compiledPath: compiledPath!,
        })

        if (runResult.exitCode === 0 && !runResult.timeout && !runResult.runtimeError) {
          // 运行成功，更新输出
          updatedTestCases.push({
            id: tc.id,
            output: runResult.output.trim(),
          })
          passedCount++
          results.push({ id: tc.id, status: 'OK', time: runResult.time, memory: runResult.memory })
        } else {
          // 运行失败
          failedCount++
          results.push({
            id: tc.id,
            status: 'FAILED',
            error: runResult.error || (runResult.timeout ? 'Time Limit Exceeded' : 'Runtime Error'),
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
          operatorId: user.id,
          status: 'FAILED',
          details: {
            passed: passedCount,
            failed: failedCount,
            results: results,
          },
        },
      })

      return ok({
        success: false,
        error: `标程在 ${failedCount} 个测试点上运行失败，请检查标程或输入数据`,
        data: { results },
      })
    }

    // 4. 更新数据库
    await prisma.$transaction(async (tx) => {
      for (const tc of updatedTestCases) {
        await tx.testCase.update({
          where: { id: tc.id },
          data: { output: tc.output },
        })
      }

      // 更新题目状态
      await tx.problem.update({
        where: { id },
        data: {
          stdCode: solutionCode,
          stdLang: solutionLanguage,
        },
      })

      // Log Success
      await tx.verificationLog.create({
        data: {
          problemId: id,
          operatorId: user.id,
          status: 'SUCCESS',
          details: {
            passed: passedCount,
            failed: 0,
            results: results,
            fixedCount: updatedTestCases.length,
          },
        },
      })
    })

    return ok({
      success: true,
      message: `验证通过，已更新 ${passedCount} 个测试点的输出数据`,
      data: { results },
    })
  } catch (e: any) {
    throw500('服务器错误: ' + e.message)
  } finally {
    if (compiledPath) {
      await cleanup(compiledPath)
    }
  }
})
