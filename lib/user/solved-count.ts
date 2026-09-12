/**
 * 「解题数」的唯一口径 —— lib/user/solved-count.ts
 *
 * 语义：AC 去重题数（distinct problemId where status = AC）。
 *
 * 为什么需要集中一处：
 *   User.solvedCount 是评测时增量维护的 denormalized 计数，在历史数据导入、
 *   删题回退、封榜解冻等场景下可能与事实漂移；而「AC 提交条数」是另一个指标
 *   （acceptedSubmissions），常被误当成解题数。
 *   首页、个人主页、排行榜若各自决定用哪个，就会出现同一账号在不同页面
 *   数字不一致（曾出现首页「累计 AC」= 1、个人主页「解题」= 3）。
 *
 * 策略：优先信任 denormalized 计数（零成本）；为 0 或缺失时用实时聚合兜底，
 * 保证漂移情况下也不会显示错误数字。
 */
import { prisma } from '@/lib/prisma'
import { SubmissionStatus } from '@/lib/constants/submission-status'

export async function getSolvedProblemCount(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { solvedCount: true },
  })
  if (user?.solvedCount) return user.solvedCount

  // 计数为 0：可能是「真的一题没解」，也可能是计数漂移。用提交记录兜底判断。
  const solvedGroups = await prisma.submission.groupBy({
    by: ['problemId'],
    where: { userId, status: SubmissionStatus.ACCEPTED },
  })
  return solvedGroups.length
}
