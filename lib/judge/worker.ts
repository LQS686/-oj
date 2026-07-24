// 评测Worker - 监听队列并执行评测
import { judgeQueue, addJudgeJob } from './queue'
import { cleanupOldTempFiles } from './judger'
import { prisma } from '@/lib/prisma'
import type { JudgeJob, JudgeResult, QueuedJob } from './queue'
import type { ComparisonMode } from './types'
import { emitSubmissionUpdate, broadcastMessage } from '@/lib/websocket/server'
import {
  updateSubmissionDirect,
  updateClassAssignmentSubmissionDirect,
  incrementProblemAcceptedCount,
  isFirstAccepted,
  isFirstAcInAssignment,
} from '@/lib/mongodb-direct'
import { logger } from '@/lib/logger'
import { cache } from '@/lib/cache'
import { CacheKeys } from '@/lib/constants/cache-keys'
import { SubmissionStatus } from '@/lib/constants/submission-status'
import { finalizeTiming } from '@/lib/gamification/timing'

// 监听评测完成事件（热重载守卫：避免 Next.js dev 模式重复注册监听器）
if (judgeQueue.listenerCount('completed') === 0) judgeQueue.on('completed', async (job: QueuedJob, result: JudgeResult) => {
  try {
    logger.info(`更新数据库`, { submissionId: result.submissionId, status: result.status })

    // 获取完整的提交记录
    const submission = await prisma.submission.findUnique({
      where: { id: result.submissionId }
    })

    if (!submission) {
      logger.error(`未找到提交记录`, undefined, { submissionId: result.submissionId })
      return
    }

    // 更新提交记录（使用 direct MongoDB 驱动绕过 Prisma 事务）
    await updateSubmissionDirect(result.submissionId, {
      status: result.status,
      score: result.score,
      time: result.time,
      memory: result.memory,
      passedTests: result.passedTests,
      message: result.message,
      testResults: result.testResults
    })

    // 失效提交详情缓存 + 题目状态统计缓存（状态变化后读旧缓存会拿到陈旧数据）
    cache.delete(`submission:byId:${result.submissionId}`)
    cache.delete(CacheKeys.problem.statusCounts(submission.problemId))
    cache.delete(CacheKeys.problem.stats(submission.problemId))

    // 如果AC，更新题目通过数
    // 标记首次 AC（提升作用域，供后续作业计时使用）
    let isFirstAcGlobal = false
    if (result.status === 'AC') {
      // 检查是否是该用户第一次AC此题
      // 查找该用户在此题目上除了当前提交之外的AC记录
      isFirstAcGlobal = await isFirstAccepted(submission.problemId, submission.userId, result.submissionId)

      // 只有第一次AC才增加题目的totalAccepted
      if (isFirstAcGlobal) {
        await incrementProblemAcceptedCount(submission.problemId)

        // ✅ 增加用户解题数
        await prisma.user.update({
          where: { id: submission.userId },
          data: { solvedCount: { increment: 1 } }
        })

        logger.info(`用户首次AC题目`, { problemId: submission.problemId })

        // 📢 广播排行榜更新
        broadcastMessage('leaderboard:update', {
             type: 'update',
             userId: submission.userId,
             problemId: submission.problemId
        })
      }
    }

    // ✅ 同步到 ClassAssignmentSubmission
    // 只更新已存在的作业提交记录（由作业提交 API 创建）
    // assignmentSubmissionId 提升到外层，供后续 WebSocket 推送 timeElapsedMs 使用
    let assignmentSubmissionId: string | null = null
    try {
      logger.info(`开始同步作业提交记录`)

      // ✅ 检查是否有关联的作业提交ID
      if (submission.assignmentSubmissionId) {
        logger.info(`找到关联的作业提交记录`, { assignmentSubmissionId: submission.assignmentSubmissionId })
        assignmentSubmissionId = submission.assignmentSubmissionId

        // ✅ 查询作业提交记录的详细信息
        const assignmentSubmission = await prisma.classAssignmentSubmission.findUnique({
          where: { id: submission.assignmentSubmissionId }
        })

        // Phase 1 调整：作业维度仅记录 isLate 标记，不再强制将逾期提交的分数置 0。
        // 评分一致性：作业提交分数 = 评测原始分数（result.score）。
        // 是否计入有效成绩由前端统计逻辑根据 isLate 字段决定。
        const finalScore = result.score

        // ✅ 精确更新对应的作业提交记录
        await updateClassAssignmentSubmissionDirect(submission.assignmentSubmissionId, {
            status: result.status,
            score: finalScore,
            time: result.time,
            memory: result.memory,
            passedTests: result.passedTests,
            message: result.message
        })

        logger.info(`已更新作业提交记录`, { assignmentSubmissionId: submission.assignmentSubmissionId, status: result.status, score: finalScore })

        // ✅ Phase 1：班级作业首次 AC 时，终结计时并将用时写入 ClassAssignmentSubmission
        // - 使用「作业维度首次 AC」(isFirstAcInAssignment)，区别于全局首次 AC (isFirstAcGlobal)
        //   作业维度：查询 ClassAssignmentSubmission 表，仅判断本作业内是否首次 AC
        //   全局维度：查询 Submission 表，触发 solvedCount++ 与题目通过数
        // - finalizeTiming 内部已做幂等处理（已完成则返回已有 finalTimeMs）
        // - 不调用 grantFirstAcRewards（Phase 2+ 启用）
        // - 失败仅 logger.error，不阻断主流程
        if (assignmentSubmission && result.status === 'AC') {
          let isFirstAcInAssign = false
          try {
            isFirstAcInAssign = await isFirstAcInAssignment(
              assignmentSubmission.assignmentId,
              submission.problemId,
              submission.userId,
              assignmentSubmission.id
            )
          } catch (checkErr) {
            logger.error(
              'isFirstAcInAssignment 检查失败',
              checkErr instanceof Error ? checkErr : new Error(String(checkErr)),
              { assignmentSubmissionId: assignmentSubmission.id }
            )
          }
          if (isFirstAcInAssign) {
            try {
              const finalTimeMs = await finalizeTiming(
                assignmentSubmission.assignmentId,
                submission.problemId,
                submission.userId
              )
              if (finalTimeMs != null) {
                await prisma.classAssignmentSubmission.update({
                  where: { id: assignmentSubmission.id },
                  data: {
                    timeElapsedMs: finalTimeMs,
                    isFirstAc: true,
                  },
                })
                logger.info(`已写入作业计时`, {
                  assignmentSubmissionId: assignmentSubmission.id,
                  finalTimeMs,
                })
              } else {
                // 用户从未打开题目作答页就直接提交 AC：无计时数据，仅标记 isFirstAc
                await prisma.classAssignmentSubmission.update({
                  where: { id: assignmentSubmission.id },
                  data: { isFirstAc: true },
                })
                logger.warn(`首次 AC 但无计时数据`, {
                  assignmentSubmissionId: assignmentSubmission.id,
                })
              }
            } catch (timingErr) {
              logger.error(
                'finalizeTiming 集成失败',
                timingErr instanceof Error ? timingErr : new Error(String(timingErr)),
                { assignmentSubmissionId: assignmentSubmission.id }
              )
            }
          }
        }
      } else {
        logger.info(`普通题库提交，无需同步到作业`)
      }
    } catch (syncError) {
      logger.error(`同步作业提交记录失败`, syncError)
      // 不影响主流程
    }

    // 📡 实时推送评测结果
    try {
      // 作业提交 AC 时，附带作业维度的做题用时（timeElapsedMs），
      // 让前端弹窗能显示"本道题目用时 xx"
      let assignmentTimeElapsedMs: number | undefined
      if (assignmentSubmissionId && result.status === 'AC') {
        try {
          const refreshed = await prisma.classAssignmentSubmission.findUnique({
            where: { id: assignmentSubmissionId },
            select: { timeElapsedMs: true },
          })
          assignmentTimeElapsedMs = refreshed?.timeElapsedMs ?? undefined
        } catch {
          // 查询失败不影响推送主流程
        }
      }
      emitSubmissionUpdate(submission.userId, {
        id: result.submissionId,
        status: result.status,
        score: result.score,
        time: result.time,
        memory: result.memory,
        passedTests: result.passedTests,
        totalTests: result.totalTests || 0,
        problemId: submission.problemId,
        message: result.message,
        testResults: result.testResults,
        timeElapsedMs: assignmentTimeElapsedMs,
      })
    } catch (wsError) {
      logger.error(`WebSocket 推送失败`, wsError)
    }

    logger.info(`数据库更新成功`)
  } catch (error) {
    logger.error(`更新数据库失败`, error)
  }
})

// 监听评测失败事件（热重载守卫：避免 Next.js dev 模式重复注册监听器）
if (judgeQueue.listenerCount('failed') === 0) judgeQueue.on('failed', async (job: QueuedJob, error: Error) => {
  try {
    logger.error(`评测失败`, error, { jobId: job.id })
    
    // 获取提交记录（用于实时推送 + 判断是否关联作业）
    const submission = await prisma.submission.findUnique({
      where: { id: job.id },
      select: { userId: true, assignmentSubmissionId: true },
    })

    // 更新为系统错误
    await updateSubmissionDirect(job.id, {
      status: SubmissionStatus.SYSTEM_ERROR,
      message: `系统错误: ${error.message}`
    })

    // 同步更新班级作业提交表（如果关联了作业）
    if (submission?.assignmentSubmissionId) {
      try {
        await updateClassAssignmentSubmissionDirect(submission.assignmentSubmissionId, {
          status: SubmissionStatus.SYSTEM_ERROR,
          message: `系统错误: ${error.message || '评测失败'}`,
        })
      } catch (e) {
        logger.error('同步作业提交 SE 状态失败', e)
      }
    }

    // 📡 实时推送错误状态
    if (submission) {
      try {
        emitSubmissionUpdate(submission.userId, {
          id: job.id,
          status: 'SE',
          score: 0,
          time: 0,
          memory: 0,
          passedTests: 0,
          totalTests: 0,
          message: `系统错误: ${error.message}`,
        })
      } catch (wsError) {
        logger.error(`WebSocket 推送失败`, wsError)
      }
    }
  } catch (dbError) {
    logger.error(`更新失败状态时出错`, dbError)
  }
})

// 启动时扫描 DB 中 status='PENDING'/'JUDGING'/'RUNNING' 的 submission 重新入队（重启恢复）
// 注：submitCode 创建提交时 status='PENDING'，评测中仅在内存 JudgeResult 中为 'JUDGING'（不写 DB），
// 评测完成后直接写最终状态（AC/WA/TLE...）。因此 Worker 崩溃后，DB 中残留的是 'PENDING'（未开始）
// 或 'JUDGING'（历史兼容）。两者都需恢复。
// 项目约束（Task 12.3）：recover 路径需接受 PENDING/JUDGING/RUNNING 作为合法起始状态，
// 此处扫描时同时兼容历史字面量 'Pending'/'Judging'/'Running' 以防 DB 中存在旧数据。
async function recoverPendingJobs() {
  try {
    const pendingSubmissions = await prisma.submission.findMany({
      where: {
        status: {
          in: [
            SubmissionStatus.PENDING,
            SubmissionStatus.JUDGING,
            SubmissionStatus.RUNNING,
            // 历史大驼峰兼容
            'Pending',
            'Judging',
            'Running',
          ],
        },
      },
      include: { problem: { include: { testCases: true } } },
    })
    if (pendingSubmissions.length === 0) {
      logger.info('无需恢复的任务')
      return
    }
    logger.info(`发现 ${pendingSubmissions.length} 个待恢复任务，重新入队`)
    await Promise.allSettled(pendingSubmissions.map(async (sub) => {
      try {
        if (!sub.problem) {
          logger.warn(`跳过恢复：题目不存在`, { submissionId: sub.id })
          return
        }
        const testCases = sub.problem.testCases.map(tc => ({
          id: tc.id,
          input: tc.input,
          output: tc.output,
          score: tc.score,
          timeLimit: tc.timeLimit ?? undefined,
          memoryLimit: tc.memoryLimit ?? undefined,
        }))
        const job: JudgeJob = {
          submissionId: sub.id,
          problemId: sub.problemId,
          userId: sub.userId,
          code: sub.code,
          language: sub.language,
          timeLimit: sub.problem.timeLimit,
          memoryLimit: sub.problem.memoryLimit,
          comparisonMode: (sub.problem.comparisonMode ?? 'default') as ComparisonMode,
          realPrecision: sub.problem.realPrecision ?? 3,
          testCases,
        }
        await addJudgeJob(job)
        logger.info(`已恢复任务`, { submissionId: sub.id })
      } catch (err) {
        logger.error(`恢复任务失败`, err, { submissionId: sub.id })
      }
    }))
  } catch (err) {
    logger.error('扫描待恢复任务失败', err)
  }
}

// 定时器引用（保存以便统一优雅关闭时清理，关闭逻辑由 server.ts 调用 disposeWorker 处理）
let statsInterval: NodeJS.Timeout | null = null
let cleanupInterval: NodeJS.Timeout | null = null

// 守卫：Next.js dev 模式热重载时避免重复注册定时器/恢复任务
declare global {
  var __judgeWorkerInitialized: boolean | undefined
}

if (!global.__judgeWorkerInitialized) {
  global.__judgeWorkerInitialized = true

  // P0 Security: 生产环境未启用 Docker 评测沙箱告警（不阻塞启动）
  if (process.env.NODE_ENV === 'production' && process.env.USE_DOCKER !== 'true') {
    logger.warn('生产环境未启用 Docker 评测沙箱，选手代码可能访问进程资源，建议设置 USE_DOCKER=true')
  }

  // 定期输出队列状态
  statsInterval = setInterval(async () => {
    try {
      const stats = judgeQueue.getStats()
      logger.info(`队列状态`, { waiting: stats.waiting, active: stats.active, completed: stats.completed })
    } catch (err) {
      logger.error('获取队列状态失败', err)
    }
  }, 30000)

  // P1-2: 定期清理过期临时文件（10分钟），防止编译源文件堆积
  cleanupInterval = setInterval(() => {
    try {
      cleanupOldTempFiles()
    } catch (e) {
      logger.error('清理过期临时文件失败', e)
    }
  }, 600000)

  // 在文件末尾启动恢复
  recoverPendingJobs().then(() => {
    logger.info('评测Worker已启动')
    logger.info('正在监听评测队列...')
  })
}

// 清理 Worker 定时器（供 server.ts 统一优雅关闭调用；judgeQueue.dispose 由其另行调用）
export function disposeWorker() {
  if (statsInterval) {
    clearInterval(statsInterval)
    statsInterval = null
  }
  if (cleanupInterval) {
    clearInterval(cleanupInterval)
    cleanupInterval = null
  }
}
