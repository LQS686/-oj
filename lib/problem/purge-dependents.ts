/**
 * 删除题目前置依赖清理（单题 / 批量共用）
 */
import { prisma } from '@/lib/prisma'
import { invalidateProblemTestCaseCache } from '@/lib/judge/testcase-loader'

/**
 * 删除题目前置依赖（作业进度/作业题关联/作业提交/验证日志/提交/题解/竞赛/题单/测试点）
 * 以及作业 problemIds 数组中的引用。必须在 problem.delete / deleteMany 之前调用。
 */
export async function purgeProblemDependents(problemIds: string[]) {
  if (!Array.isArray(problemIds) || problemIds.length === 0) return

  await prisma.classAssignmentProblemProgress.deleteMany({
    where: { problemId: { in: problemIds } },
  })
  await prisma.classAssignmentProblem.deleteMany({
    where: { problemId: { in: problemIds } },
  })
  await prisma.classAssignmentSubmission.deleteMany({
    where: { problemId: { in: problemIds } },
  })
  await prisma.verificationLog.deleteMany({
    where: { problemId: { in: problemIds } },
  })
  await prisma.submission.deleteMany({ where: { problemId: { in: problemIds } } })
  await prisma.solution.deleteMany({ where: { problemId: { in: problemIds } } })
  await prisma.contestProblem.deleteMany({ where: { problemId: { in: problemIds } } })
  await prisma.trainingProblem.deleteMany({ where: { problemId: { in: problemIds } } })
  await Promise.all(problemIds.map((id) => invalidateProblemTestCaseCache(id)))
  await prisma.testCase.deleteMany({ where: { problemId: { in: problemIds } } })

  // ClassAssignment.problemIds 是裸 ObjectId 数组，无外键级联，需手动剔除
  const assignments = await prisma.classAssignment.findMany({
    where: { problemIds: { hasSome: problemIds } },
    select: { id: true, problemIds: true },
  })
  if (assignments.length > 0) {
    const remove = new Set(problemIds)
    await Promise.all(
      assignments.map((a) =>
        prisma.classAssignment.update({
          where: { id: a.id },
          data: { problemIds: a.problemIds.filter((id) => !remove.has(id)) },
        })
      )
    )
  }
}
