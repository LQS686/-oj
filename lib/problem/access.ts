/**
 * lib/problem/access.ts
 * 题目可见性统一鉴权（公开题库 / 竞赛题 / 作者与管理员）
 *
 * 单一真相源：visibility（public | private | contest）。
 * 竞赛上下文必须显式传入 contestId，不做「扫描全部竞赛」兜底。
 * 题目仅由后台统一维护；不存在班级私有题库。
 */
import { prisma } from '@/lib/prisma'
import { AppError } from '@/lib/errors'
import { canAccessAdmin } from '@/lib/permissions'
import { checkContestAccess } from '@/lib/contest-auth'
import type { RoleUser } from '@/lib/permissions'
import type { JWTPayload } from '@/lib/auth'

export type ProblemAccessFields = {
  id: string
  authorId: string
  visibility: string
}

export type ProblemAccessViewer = RoleUser & { id: string }

export type ProblemAccessOptions = {
  /** 竞赛上下文：访问 contest 可见性题目时必须传入 */
  contestId?: string
}

function isPublicProblem(p: Pick<ProblemAccessFields, 'visibility'>): boolean {
  return p.visibility === 'public'
}

function toJwtPayload(viewer: ProblemAccessViewer): JWTPayload {
  return {
    userId: viewer.id,
    role: viewer.role || 'STUDENT',
    email: '',
    username: '',
    tokenVersion: 0,
  }
}

/** 通过指定竞赛题目关联 + checkContestAccess 判定是否可访问 */
async function canAccessViaContest(
  problemId: string,
  viewer: ProblemAccessViewer,
  contestId: string
): Promise<boolean> {
  const linked = await prisma.contestProblem.findFirst({
    where: { contestId, problemId },
    select: { contestId: true },
  })
  if (!linked) return false

  const result = await checkContestAccess(contestId, toJwtPayload(viewer))
  return result.allowed
}

/**
 * 断言当前用户可查看/使用该题目。
 * 不可访问时统一 404，避免非公开题存在性探测。
 */
export async function assertCanAccessProblem(
  problem: ProblemAccessFields,
  viewer: ProblemAccessViewer | null,
  options: ProblemAccessOptions = {}
): Promise<void> {
  if (isPublicProblem(problem)) return

  if (viewer && canAccessAdmin(viewer)) return
  if (viewer && viewer.id === problem.authorId) return

  // contest 可见性：必须以竞赛路径校验
  if (problem.visibility === 'contest') {
    if (viewer && options.contestId) {
      const viaContest = await canAccessViaContest(problem.id, viewer, options.contestId)
      if (viaContest) return
    }
    throw AppError.notFound('题目不存在')
  }

  // 其它非公开题（含后台隐藏草稿）：带 contestId 时经报名与时间窗校验
  if (viewer && options.contestId) {
    const viaContest = await canAccessViaContest(problem.id, viewer, options.contestId)
    if (viaContest) return
  }

  throw AppError.notFound('题目不存在')
}

/** 按 id / problemNumber 取题目访问字段；不存在返回 null */
export async function findProblemAccessFields(
  idOrNumber: string
): Promise<ProblemAccessFields | null> {
  const isOid = /^[0-9a-fA-F]{24}$/.test(idOrNumber)
  return prisma.problem.findFirst({
    where: isOid ? { id: idOrNumber } : { problemNumber: idOrNumber },
    select: {
      id: true,
      authorId: true,
      visibility: true,
    },
  })
}

/**
 * 查找题目并校验访问权；不可访问或不存在均 404。
 */
export async function requireAccessibleProblem(
  idOrNumber: string,
  viewer: ProblemAccessViewer | null,
  options: ProblemAccessOptions = {}
): Promise<ProblemAccessFields> {
  const problem = await findProblemAccessFields(idOrNumber)
  if (!problem) throw AppError.notFound('题目不存在')
  await assertCanAccessProblem(problem, viewer, options)
  return problem
}
