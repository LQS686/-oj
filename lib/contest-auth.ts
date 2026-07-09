import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { JWTPayload } from '@/lib/auth'
import { canManageContent } from '@/lib/permissions'
import { NextRequest } from 'next/server'

// 审计日志记录函数
async function logAccess(
  action: string,
  resource: string,
  userId?: string,
  req?: NextRequest,
  details?: any
) {
  const ip = req?.headers.get('x-forwarded-for') || (req as any)?.ip || 'unknown'
  const userAgent = req?.headers.get('user-agent') || 'unknown'
  
  logger.info(`[Audit] ${action} | User: ${userId || 'Guest'} | Resource: ${resource} | IP: ${ip}`)

  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        resource,
        details: details ? JSON.stringify(details) : undefined,
        ip,
        userAgent
      }
    })
  } catch (err) {
    // Fail silently for audit log DB errors to not block main flow
    console.error('Failed to write audit log:', err)
  }
}

export async function checkContestAccess(
  contestId: string, 
  currentUser: JWTPayload | null,
  req?: NextRequest
): Promise<{ 
  allowed: boolean; 
  error?: string; 
  status?: number; 
  contest?: any 
}> {
  const resourcePath = req?.nextUrl?.pathname || `/contests/${contestId}`

  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
  })

  if (!contest) {
    return { allowed: false, error: '竞赛不存在', status: 404 }
  }

  const now = new Date()
  const isStarted = now >= contest.startTime
  const isEnded = now > contest.endTime
  const isAdmin = canManageContent(currentUser ? { id: currentUser.userId, role: currentUser.role } : null) || contest.authorId === currentUser?.userId

  if (isAdmin) {
    return { allowed: true, contest }
  }

  // 1. 比赛未开始：严格隐藏
  if (!isStarted) {
    await logAccess('ACCESS_DENIED_NOT_STARTED', resourcePath, currentUser?.userId, req, { contestId })
    return { allowed: false, error: '比赛尚未开始', status: 403 }
  }

  // 2. 比赛已结束且公开：对登录用户开放
  // Requirement: "对所有用户（不包括未注册用户）完全可见" -> 必须登录
  if (isEnded && contest.isPublic) {
    if (!currentUser) {
      await logAccess('ACCESS_DENIED_GUEST', resourcePath, undefined, req, { contestId, reason: 'Login required for ended public contest' })
      return { allowed: false, error: '请先登录', status: 401 }
    }
    return { allowed: true, contest }
  }

  // 3. 其他情况（进行中 或 结束但私有）：必须报名
  if (!currentUser) {
    await logAccess('ACCESS_DENIED_GUEST', resourcePath, undefined, req, { contestId })
    return { allowed: false, error: '请先登录', status: 401 }
  }

  const participant = await prisma.contestParticipant.findUnique({
    where: {
      contestId_userId: {
        contestId: contestId,
        userId: currentUser.userId,
      },
    },
  })

  if (!participant) {
    await logAccess('ACCESS_DENIED_NOT_REGISTERED', resourcePath, currentUser.userId, req, { contestId })
    return { allowed: false, error: '请先报名参赛', status: 403 }
  }

  return { allowed: true, contest }
}
