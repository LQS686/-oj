// 评测Worker - 监听队列并执行评测
import { judgeQueue, addJudgeJob } from './queue'
import { prisma } from '@/lib/prisma'
import type { JudgeJob, JudgeResult, QueuedJob } from './queue'
import type { ComparisonMode } from './types'
import { emitSubmissionUpdate, broadcastMessage } from '@/lib/websocket/server'
import { 
  updateSubmissionDirect, 
  updateClassAssignmentSubmissionDirect, 
  incrementProblemAcceptedCount, 
  isFirstAccepted 
} from '@/lib/mongodb-direct'
import { logger } from '@/lib/logger'
import { cache } from '@/lib/cache'

// 监听评测完成事件
judgeQueue.on('completed', async (job: QueuedJob, result: JudgeResult) => {
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
    
    // 更新提交记录
    // await prisma.submission.update({
    //   where: { id: result.submissionId },
    //   data: {
    //     status: result.status,
    //     score: result.score,
    //     time: result.time,
    //     memory: result.memory,
    //     passedTests: result.passedTests,
    //     message: result.message,
    //   }
    // })

    // 使用 direct MongoDB 驱动绕过 Prisma 事务
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
    cache.delete(`problem:statusCounts:${submission.problemId}`)

    // 如果AC，更新题目通过数
    if (result.status === 'AC') {
      // 检查是否是该用户第一次AC此题
      // 查找该用户在此题目上除了当前提交之外的AC记录
      const isFirst = await isFirstAccepted(submission.problemId, submission.userId, result.submissionId)

      // 只有第一次AC才增加题目的totalAccepted
      if (isFirst) {
        // await prisma.problem.update({
        //   where: { id: submission.problemId },
        //   data: { totalAccepted: { increment: 1 } }
        // })
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
    try {
      logger.info(`开始同步作业提交记录`)
      
      // ✅ 检查是否有关联的作业提交ID
      if (submission.assignmentSubmissionId) {
        logger.info(`找到关联的作业提交记录`, { assignmentSubmissionId: submission.assignmentSubmissionId })
        
        // ✅ 查询作业提交记录的详细信息，包括isLate字段
        const assignmentSubmission = await prisma.classAssignmentSubmission.findUnique({
          where: { id: submission.assignmentSubmissionId }
        })
        
        // 计算最终分数：如果是逾期提交，则分数为0
        let finalScore = result.score
        if (assignmentSubmission) {
          if (assignmentSubmission.isLate) {
            finalScore = 0
            logger.warn(`逾期提交，分数设置为0`, { assignmentSubmissionId: submission.assignmentSubmissionId })
          } else {
            logger.info(`非逾期提交，使用原始分数`, { finalScore })
          }
        }
        
        // ✅ 精确更新对应的作业提交记录
        // await prisma.classAssignmentSubmission.update({
        //   where: { id: submission.assignmentSubmissionId },
        //   data: {
        //     status: result.status,
        //     score: finalScore,
        //     time: result.time,
        //     memory: result.memory,
        //     passedTests: result.passedTests,
        //     totalTests: result.totalTests || 0,
        //     message: result.message
        //   }
        // })

        await updateClassAssignmentSubmissionDirect(submission.assignmentSubmissionId, {
            status: result.status,
            score: finalScore,
            time: result.time,
            memory: result.memory,
            passedTests: result.passedTests,
            message: result.message
        })
        
        logger.info(`已更新作业提交记录`, { assignmentSubmissionId: submission.assignmentSubmissionId, status: result.status, score: finalScore })
      } else {
        logger.info(`普通题库提交，无需同步到作业`)
      }
    } catch (syncError) {
      logger.error(`同步作业提交记录失败`, syncError)
      // 不影响主流程
    }
    
    // 📡 实时推送评测结果
    try {
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
      })
    } catch (wsError) {
      logger.error(`WebSocket 推送失败`, wsError)
    }

    logger.info(`数据库更新成功`)
  } catch (error) {
    logger.error(`更新数据库失败`, error)
  }
})

// 监听评测失败事件
judgeQueue.on('failed', async (job: QueuedJob, error: Error) => {
  try {
    logger.error(`评测失败`, error, { jobId: job.id })
    
    // 获取提交记录（用于实时推送）
    const submission = await prisma.submission.findUnique({
      where: { id: job.id },
      select: { userId: true },
    })
    
    // 更新为系统错误
    // await prisma.submission.update({
    //   where: { id: job.id },
    //   data: {
    //     status: 'SE',
    //     message: `系统错误: ${error.message}`,
    //   }
    // })

    await updateSubmissionDirect(job.id, {
      status: 'SE',
      message: `系统错误: ${error.message}`
    })

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

// 启动时扫描 DB 中 status='Judging' 的 submission 重新入队（重启恢复）
async function recoverPendingJobs() {
  try {
    const pendingSubmissions = await prisma.submission.findMany({
      where: { status: 'Judging' },
      include: { problem: { include: { testCases: true } } },
    })
    if (pendingSubmissions.length === 0) {
      logger.info('无需恢复的任务')
      return
    }
    logger.info(`发现 ${pendingSubmissions.length} 个待恢复任务，重新入队`)
    for (const sub of pendingSubmissions) {
      try {
        if (!sub.problem) {
          logger.warn(`跳过恢复：题目不存在`, { submissionId: sub.id })
          continue
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
    }
  } catch (err) {
    logger.error('扫描待恢复任务失败', err)
  }
}

// 定期输出队列状态
const statsInterval = setInterval(async () => {
  try {
    const stats = judgeQueue.getStats()
    logger.info(`队列状态`, { waiting: stats.waiting, active: stats.active, completed: stats.completed })
  } catch (err) {
    logger.error('获取队列状态失败', err)
  }
}, 30000)

// 在文件末尾启动恢复
recoverPendingJobs().then(() => {
  logger.info('评测Worker已启动')
  logger.info('正在监听评测队列...')
})

// 优雅退出
process.on('SIGINT', async () => {
  logger.info('正在关闭Worker...')
  clearInterval(statsInterval)
  judgeQueue.dispose()
  await prisma.$disconnect()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  logger.info('正在关闭Worker...')
  clearInterval(statsInterval)
  judgeQueue.dispose()
  await prisma.$disconnect()
  process.exit(0)
})
