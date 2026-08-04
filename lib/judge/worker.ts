// 评测Worker - 监听队列并执行评测
import { judgeQueue, addJudgeJob } from './queue'
import { cleanupOldTempFiles } from './judger'
import { prisma } from '@/lib/prisma'
import type { JudgeJob, JudgeResult, QueuedJob } from './queue'
import type { ComparisonMode } from './types'
import {
  emitSubmissionUpdate,
  emitJudgeProgress,
  broadcastMessage,
  cleanupJudgeProgress,
} from '@/lib/websocket/server'
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
import { mapTestCasesMeta, TESTCASE_META_SELECT } from './testcase-loader'

// 任务进入 active：立刻写 JUDGING，避免刷新后仍显示 PENDING、看起来像卡死
// 必须用 onlyFromStatuses=PENDING：CE/小数据题可能在本回调跑完前已写出终态，
// 若无条件覆盖会把 AC/WA/CE 写回 JUDGING，前端表现为「偶发不刷新 / 一直评测中」。
// 顺序修复（评测进度回退根因）：先同步推送 JUDGING + currentTest: 0，
// 再走慢查询（DB 写入 / prisma.findUnique）。队列 emit('active') 后立即开始评测
// 并推送 1/N、2/N，若 0/N 在慢查询之后才推送会迟到，导致前端进度回退。
if (judgeQueue.listenerCount('active') === 0) {
  judgeQueue.on('active', async (job: QueuedJob) => {
    try {
      const totalTests = job.data.testCases?.length ?? 0

      // 第一步：先同步推送 JUDGING 进度（0/N），不等待任何慢查询
      if (job.data.userId) {
        try {
          emitJudgeProgress(job.data.userId, {
            submissionId: job.id,
            currentTest: 0,
            totalTests,
            status: SubmissionStatus.JUDGING,
          })
          emitSubmissionUpdate(job.data.userId, {
            id: job.id,
            status: SubmissionStatus.JUDGING,
            score: 0,
            time: 0,
            memory: 0,
            passedTests: 0,
            totalTests,
            problemId: job.data.problemId,
          })
        } catch (wsErr) {
          logger.warn('评测开始时推送 JUDGING 失败', {
            jobId: job.id,
            error: wsErr instanceof Error ? wsErr.message : String(wsErr),
          })
        }
      }

      // 第二步：同步 DB 中间态（passedTests/totalTests 一并写入，保持进度字段初始一致）
      const judgingWrite = await updateSubmissionDirect(
        job.id,
        { status: SubmissionStatus.JUDGING, passedTests: 0, totalTests },
        { onlyFromStatuses: [SubmissionStatus.PENDING] },
      )
      if (!judgingWrite.matched) {
        logger.debug('跳过 JUDGING 写入：提交已离开 PENDING', { jobId: job.id })
        return
      }

      // 第三步：慢查询（作业提交同步中间态，失败不阻断；进度已在第一步推过，不再重复推送）
      try {
        const submission = await prisma.submission.findUnique({
          where: { id: job.id },
          select: { userId: true, assignmentSubmissionId: true },
        })
        if (submission?.assignmentSubmissionId) {
          await updateClassAssignmentSubmissionDirect(
            submission.assignmentSubmissionId,
            { status: SubmissionStatus.JUDGING },
            { onlyFromStatuses: [SubmissionStatus.PENDING] },
          )
        }
      } catch (wsErr) {
        logger.warn('评测开始时作业提交同步失败', {
          jobId: job.id,
          error: wsErr instanceof Error ? wsErr.message : String(wsErr),
        })
      }
    } catch (err) {
      logger.error('写入 JUDGING 状态失败', err, { jobId: job.id })
    }
  })
}

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

    const nonFinal = [
      SubmissionStatus.PENDING,
      SubmissionStatus.JUDGING,
      SubmissionStatus.RUNNING,
    ]

    // 更新提交记录（使用 direct MongoDB 驱动绕过 Prisma 事务）
    // 仅从非终态写入，避免重复 completed / 竞态覆盖
    const finalWrite = await updateSubmissionDirect(
      result.submissionId,
      {
        status: result.status,
        score: result.score,
        time: result.time,
        memory: result.memory,
        passedTests: result.passedTests,
        message: result.message,
        testResults: result.testResults,
      },
      { onlyFromStatuses: nonFinal },
    )
    if (!finalWrite.matched) {
      logger.warn('跳过终态写入：提交已不在评测中', {
        submissionId: result.submissionId,
        status: result.status,
      })
      return
    }

    // 终态已落库，清理进度节流条目（防止长跑服务 progressThrottle 内存泄漏）
    cleanupJudgeProgress(result.submissionId)

    // 失效提交详情缓存 + 题目状态/详情缓存（任意终态都可能改变统计）
    cache.delete(`submission:byId:${result.submissionId}`)
    // statusCounts 实际 key 含 contestId/viewerId 变体，需按题目前缀失效
    cache.deleteByPrefix(CacheKeys.problem.statusCounts(submission.problemId))
    cache.delete(CacheKeys.problem.stats(submission.problemId))
    cache.delete(CacheKeys.problem.byId(submission.problemId))

    const assignmentSubmissionId = submission.assignmentSubmissionId ?? null

    // 📡 主记录落库后立刻推送终态，不等待作业同步 / 首次 AC / 排行榜等慢路径
    try {
      emitSubmissionUpdate(submission.userId, {
        id: result.submissionId,
        status: result.status,
        score: result.score,
        time: result.time,
        memory: result.memory,
        passedTests: result.passedTests,
        totalTests: result.totalTests ?? 0,
        problemId: submission.problemId,
        message: result.message,
        testResults: result.testResults,
        assignmentSubmissionId: assignmentSubmissionId ?? undefined,
      })
    } catch (wsError) {
      logger.error(`WebSocket 推送失败`, wsError)
    }

    // AC 率口径：totalAccepted / totalSubmit 均为「提交次数」
    // 每次 AC 都 +1 totalAccepted；用户解题数 / 排行榜仅在全局首次 AC 时更新
    // 封榜期间竞赛 AC 不写入全局计数，解冻后再补齐，避免封榜侧信道
    if (result.status === 'AC') {
      try {
        let deferGlobalAc = false
        if (submission.contestId) {
          const { isContestSealed } = await import('@/lib/contest/rankings')
          const contest = await prisma.contest.findUnique({
            where: { id: submission.contestId },
            select: { sealRankTime: true, sealUnlocked: true },
          })
          if (contest && isContestSealed(contest)) {
            deferGlobalAc = true
          }
        }

        if (!deferGlobalAc) {
          await incrementProblemAcceptedCount(submission.problemId)
          const isFirstAcGlobal = await isFirstAccepted(
            submission.problemId,
            submission.userId,
            result.submissionId,
          )
          if (isFirstAcGlobal) {
            await prisma.user.update({
              where: { id: submission.userId },
              data: { solvedCount: { increment: 1 } },
            })

            logger.info(`用户首次AC题目`, { problemId: submission.problemId })

            const { clearRankingCache } = await import('@/lib/ranking/service')
            clearRankingCache()

            broadcastMessage('leaderboard:update', {
              type: 'update',
              userId: submission.userId,
              problemId: submission.problemId,
            })
          }
        } else {
          logger.info('封榜期间跳过全局 AC 计数', {
            submissionId: result.submissionId,
            contestId: submission.contestId,
          })
        }
      } catch (acErr) {
        logger.error('更新 AC 统计失败', acErr, { submissionId: result.submissionId })
      }
    }

    // ✅ 同步到 ClassAssignmentSubmission（慢路径；完成后可补推 timeElapsedMs）
    try {
      if (assignmentSubmissionId) {
        logger.info(`找到关联的作业提交记录`, { assignmentSubmissionId })

        const assignmentSubmission = await prisma.classAssignmentSubmission.findUnique({
          where: { id: assignmentSubmissionId },
        })

        const finalScore = result.score

        await updateClassAssignmentSubmissionDirect(
          assignmentSubmissionId,
          {
            status: result.status,
            score: finalScore,
            time: result.time,
            memory: result.memory,
            passedTests: result.passedTests,
            message: result.message,
            ...(result.status !== 'AC'
              ? { isFirstAc: false, timeElapsedMs: 0 }
              : {}),
          },
          { onlyFromStatuses: nonFinal },
        )

        logger.info(`已更新作业提交记录`, {
          assignmentSubmissionId,
          status: result.status,
          score: finalScore,
        })

        let assignmentTimeElapsedMs: number | undefined
        if (assignmentSubmission && result.status === 'AC') {
          let isFirstAcInAssign = false
          try {
            isFirstAcInAssign = await isFirstAcInAssignment(
              assignmentSubmission.assignmentId,
              submission.problemId,
              submission.userId,
              assignmentSubmission.id,
            )
          } catch (checkErr) {
            logger.error(
              'isFirstAcInAssignment 检查失败',
              checkErr instanceof Error ? checkErr : new Error(String(checkErr)),
              { assignmentSubmissionId: assignmentSubmission.id },
            )
          }
          if (isFirstAcInAssign) {
            try {
              const finalTimeMs = await finalizeTiming(
                assignmentSubmission.assignmentId,
                submission.problemId,
                submission.userId,
              )
              if (finalTimeMs != null) {
                await prisma.classAssignmentSubmission.update({
                  where: { id: assignmentSubmission.id },
                  data: {
                    timeElapsedMs: finalTimeMs,
                    isFirstAc: true,
                  },
                })
                assignmentTimeElapsedMs = finalTimeMs
                logger.info(`已写入作业计时`, {
                  assignmentSubmissionId: assignmentSubmission.id,
                  finalTimeMs,
                })
              } else {
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
                { assignmentSubmissionId: assignmentSubmission.id },
              )
            }
          }
        }

        // 作业用时就绪后再补一枪（弹窗可显示「本道题目用时」）
        if (assignmentTimeElapsedMs != null) {
          try {
            emitSubmissionUpdate(submission.userId, {
              id: result.submissionId,
              status: result.status,
              score: result.score,
              time: result.time,
              memory: result.memory,
              passedTests: result.passedTests,
              totalTests: result.totalTests ?? 0,
              problemId: submission.problemId,
              message: result.message,
              testResults: result.testResults,
              timeElapsedMs: assignmentTimeElapsedMs,
              assignmentSubmissionId,
            })
          } catch (wsError) {
            logger.error(`WebSocket 补推 timeElapsedMs 失败`, wsError)
          }
        }
      }
    } catch (syncError) {
      logger.error(`同步作业提交记录失败`, syncError)
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

    // 更新为系统错误（仅非终态，避免覆盖已写出的正常结果）
    const seWrite = await updateSubmissionDirect(
      job.id,
      {
        status: SubmissionStatus.SYSTEM_ERROR,
        message: `系统错误: ${error.message}`,
      },
      {
        onlyFromStatuses: [
          SubmissionStatus.PENDING,
          SubmissionStatus.JUDGING,
          SubmissionStatus.RUNNING,
        ],
      },
    )
    if (!seWrite.matched) {
      logger.warn('跳过 SE 写入：提交已不在评测中', { jobId: job.id })
      return
    }

    // 失败已落库为 SE，清理进度节流条目（防止长跑服务 progressThrottle 内存泄漏）
    cleanupJudgeProgress(job.id)

    // 同步更新班级作业提交表（如果关联了作业）
    if (submission?.assignmentSubmissionId) {
      try {
        await updateClassAssignmentSubmissionDirect(
          submission.assignmentSubmissionId,
          {
            status: SubmissionStatus.SYSTEM_ERROR,
            message: `系统错误: ${error.message || '评测失败'}`,
          },
          {
            onlyFromStatuses: [
              SubmissionStatus.PENDING,
              SubmissionStatus.JUDGING,
              SubmissionStatus.RUNNING,
            ],
          },
        )
      } catch (e) {
        logger.error('同步作业提交 SE 状态失败', e)
      }
    }

    // 📡 实时推送错误状态
    if (submission) {
      try {
        emitSubmissionUpdate(submission.userId, {
          id: job.id,
          status: SubmissionStatus.SYSTEM_ERROR,
          score: 0,
          time: 0,
          memory: 0,
          passedTests: 0,
          totalTests: 0,
          message: `系统错误: ${error.message}`,
          assignmentSubmissionId: submission.assignmentSubmissionId ?? undefined,
        })
      } catch (wsError) {
        logger.error(`WebSocket 推送失败`, wsError)
      }
    }
  } catch (dbError) {
    logger.error(`更新失败状态时出错`, dbError)
  }
})

// 启动时扫描 DB 中 status=PENDING/JUDGING/RUNNING 的 submission
// submitCode 创建时写 PENDING；任务 active 时写 JUDGING；完成后写终态。
// Worker 崩溃后：JUDGING/RUNNING → SE（避免启动瞬间重跑大数据量题打崩进程）；PENDING 重新入队。
async function recoverPendingJobs() {
  try {
    // 崩溃时卡在 JUDGING/RUNNING 的记录：标 SE，避免启动瞬间再次跑大数据量题把进程打崩
    const interrupted = await prisma.submission.findMany({
      where: {
        status: { in: [SubmissionStatus.JUDGING, SubmissionStatus.RUNNING] },
      },
      select: { id: true },
    })
    if (interrupted.length > 0) {
      await Promise.allSettled(
        interrupted.map((sub) =>
          updateSubmissionDirect(sub.id, {
            status: SubmissionStatus.SYSTEM_ERROR,
            message: '评测进程异常中断，请重新提交',
          }, { forceStatus: true }),
        ),
      )
      logger.warn(`已将 ${interrupted.length} 个中断中的评测标记为 SE（请用户重交）`)
    }

    const pendingSubmissions = await prisma.submission.findMany({
      where: { status: SubmissionStatus.PENDING },
      include: { problem: { include: { testCases: { select: TESTCASE_META_SELECT } } } },
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
        const testCases = mapTestCasesMeta(sub.problem.testCases)
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
          spjCode: (sub.problem as { spjCode?: string | null }).spjCode ?? null,
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
