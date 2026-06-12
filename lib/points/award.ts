/**
 * 积分自动发放工具函数
 * 用于在业务逻辑中触发积分发放
 */

import { addPoints } from './account'
import { checkPointsAwarded } from './history'
import { calculateAssignmentPoints, calculateNoteReadPoints } from './rules'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

/**
 * 完成作业题目时发放积分
 */
export async function awardAssignmentPoints(
  classId: string,
  userId: string,
  assignmentId: string,
  problemId: string,
  problemTitle: string,
  difficulty: string
) {
  try {
    // 检查是否已发放（幂等性）
    const checkResult = await checkPointsAwarded(
      classId,
      userId,
      'ASSIGNMENT_COMPLETION',
      `${assignmentId}_${problemId}`
    )

    if (checkResult.awarded) {
      console.log('[PointsAward] 积分已发放，跳过')
      return { success: true, alreadyAwarded: true }
    }

    // 计算积分
    const points = calculateAssignmentPoints(difficulty)

    // 发放积分
    const result = await addPoints(
      classId,
      userId,
      points,
      `完成作业题目「${problemTitle}」`,
      'ASSIGNMENT_COMPLETION',
      `${assignmentId}_${problemId}` // 使用组合ID保证幂等性
    )

    if (result.success) {
      logger.info(`[PointsAward] 成功发放 ${points} 积分`)
    }

    return result
  } catch (error) {
    logger.error('[PointsAward] 发放作业积分失败', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    }
  }
}

/**
 * 首次阅读笔记时发放积分
 */
export async function awardNoteReadPoints(
  classId: string,
  userId: string,
  noteId: string,
  noteTitle: string
) {
  try {
    // 检查是否已阅读过
    const readHistory = await prisma.noteReadHistory.findUnique({
      where: {
        userId_noteId: {
          userId,
          noteId
        }
      }
    })

    if (readHistory) {
      return { success: true, alreadyRead: true }
    }

    // 记录阅读历史
    // Use upsert to be safe against race conditions, though unique constraint will handle it
    // Actually create is fine, if it fails due to unique constraint, we catch it.
    try {
      await prisma.noteReadHistory.create({
        data: {
          classId,
          noteId,
          userId,
          readAt: new Date()
        }
      })
    } catch (e: any) {
      if (e.code === 'P2002') { // Unique constraint violation
        return { success: true, alreadyRead: true }
      }
      throw e
    }

    // 计算积分
    const points = calculateNoteReadPoints()

    // 发放积分
    const result = await addPoints(
      classId,
      userId,
      points,
      `首次阅读笔记「${noteTitle}」`,
      'NOTE_READ',
      noteId
    )

    if (result.success) {
      console.log(`[PointsAward] 成功发放 ${points} 积分`)
    }

    return result
  } catch (error) {
    console.error('[PointsAward] 发放笔记阅读积分失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    }
  }
}

/**
 * 课堂表现积分发放（管理员手动）
 */
export async function awardClassPerformancePoints(
  classId: string,
  userId: string,
  points: number,
  reason: string
) {
  try {
    if (points <= 0 || points > 100) {
      return {
        success: false,
        error: '积分必须在1-100之间'
      }
    }

    const result = await addPoints(
      classId,
      userId,
      points,
      `课堂表现：${reason}`,
      'CLASS_PERFORMANCE'
    )

    if (result.success) {
      logger.info(`[PointsAward] 成功发放课堂表现积分 ${points}`)
    }

    return result
  } catch (error) {
    logger.error('[PointsAward] 发放课堂表现积分失败', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    }
  }
}
