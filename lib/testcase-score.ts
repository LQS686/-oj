import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export async function redistributeTestScores(problemId: string): Promise<void> {
  try {
    const testCases = await prisma.testCase.findMany({
      where: { problemId },
      orderBy: { orderIndex: 'asc' }
    })

    if (testCases.length === 0) {
      return
    }

    const totalScore = 100
    const baseScore = Math.floor(totalScore / testCases.length)
    const remainder = totalScore % testCases.length

    const updates = testCases.map((tc, index) => {
      const score = baseScore + (index < remainder ? 1 : 0)
      return prisma.testCase.update({
        where: { id: tc.id },
        data: { score }
      })
    })

    await Promise.all(updates)
    
    logger.info(`题目 ${problemId} 测试用例分数已重新分配，共 ${testCases.length} 个用例`)
  } catch (error) {
    logger.error(`重新分配测试用例分数失败: ${problemId}`, error)
    throw error
  }
}

export async function redistributeAllProblemScores(): Promise<void> {
  try {
    const problems = await prisma.problem.findMany({
      select: { id: true }
    })

    for (const problem of problems) {
      await redistributeTestScores(problem.id)
    }

    logger.info(`已重新分配 ${problems.length} 个题目的测试用例分数`)
  } catch (error) {
    logger.error('重新分配所有题目分数失败', error)
    throw error
  }
}
