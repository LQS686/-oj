import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  classAssignmentProblemProgress: {
    findMany: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

import {
  finalizeTiming,
  getProgress,
  heartbeatTiming,
  pauseTiming,
  startOrResumeTiming,
} from '../lib/gamification/timing'

const STALE_MS = 90_000

type Progress = {
  id: string
  assignmentId: string
  problemId: string
  userId: string
  timeStarted: Date
  timeElapsedMs: number
  lastResumedAt: Date | null
  isPaused: boolean
  completedAt: Date | null
  finalTimeMs: number | null
  createdAt: Date
  updatedAt: Date
}

function makeProgress(overrides: Partial<Progress> = {}): Progress {
  const now = Date.now()
  return {
    id: 'progress-1',
    assignmentId: 'assignment-1',
    problemId: 'problem-1',
    userId: 'user-1',
    timeStarted: new Date(now - 10 * 60_000),
    timeElapsedMs: 1_000,
    lastResumedAt: new Date(now - 5 * 60_000),
    isPaused: false,
    completedAt: null,
    finalTimeMs: null,
    createdAt: new Date(now - 10 * 60_000),
    updatedAt: new Date(now - 5 * 60_000),
    ...overrides,
  }
}

function mockUpdateEcho() {
  prismaMock.classAssignmentProblemProgress.update.mockImplementation(
    async ({ where, data }: { where: { id: string }; data: Partial<Progress> }) => ({
      ...makeProgress(),
      id: where.id,
      ...data,
    })
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUpdateEcho()
})

describe('assignment timing stale-session handling', () => {
  it('读取失联的运行中进度时返回截止到最后活跃时间的暂停态', async () => {
    const row = makeProgress({
      lastResumedAt: new Date(Date.now() - 10 * 60_000),
      updatedAt: new Date(Date.now() - 5 * 60_000),
    })
    prismaMock.classAssignmentProblemProgress.findMany.mockResolvedValue([row])

    const result = await getProgress('assignment-1', 'problem-1', 'user-1')

    expect(result?.isPaused).toBe(true)
    expect(result?.lastResumedAt).toBeNull()
    // 只累计到最后活跃时间，不能把失联的 5 分钟也算进去
    expect(result?.timeElapsedMs).toBe(1_000 + 5 * 60_000)
  })

  it('暂停时一并暂停同键的所有运行中记录，避免幽灵计时', async () => {
    const first = makeProgress({
      id: 'p1',
      lastResumedAt: new Date(Date.now() - 10_000),
      updatedAt: new Date(Date.now() - 5_000),
    })
    const stale = makeProgress({
      id: 'p2',
      lastResumedAt: new Date(Date.now() - 10 * 60_000),
      updatedAt: new Date(Date.now() - 5 * 60_000),
    })
    prismaMock.classAssignmentProblemProgress.findMany
      .mockResolvedValueOnce([first, stale])
      .mockResolvedValueOnce([
        { ...first, isPaused: true, lastResumedAt: null },
        { ...stale, isPaused: true, lastResumedAt: null },
      ])

    const result = await pauseTiming('assignment-1', 'problem-1', 'user-1')

    expect(prismaMock.classAssignmentProblemProgress.update).toHaveBeenCalledTimes(2)
    expect(result?.isPaused).toBe(true)
    expect(result?.lastResumedAt).toBeNull()
  })

  it('恢复失联会话时从最后活跃时间结算后再继续', async () => {
    const stale = makeProgress({
      lastResumedAt: new Date(Date.now() - 10 * 60_000),
      updatedAt: new Date(Date.now() - 5 * 60_000),
    })
    prismaMock.classAssignmentProblemProgress.findMany.mockResolvedValue([stale])

    const result = await startOrResumeTiming('assignment-1', 'problem-1', 'user-1')

    expect(prismaMock.classAssignmentProblemProgress.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          timeElapsedMs: 1_000 + 5 * 60_000,
          isPaused: false,
        }),
      })
    )
    expect(result.isPaused).toBe(false)
  })

  it('心跳失联后重新连接时按最后活跃时间结算并恢复', async () => {
    const stale = makeProgress({
      lastResumedAt: new Date(Date.now() - 10 * 60_000),
      updatedAt: new Date(Date.now() - 5 * 60_000),
    })
    prismaMock.classAssignmentProblemProgress.findMany.mockResolvedValue([stale])

    await heartbeatTiming('assignment-1', 'problem-1', 'user-1')

    expect(prismaMock.classAssignmentProblemProgress.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          timeElapsedMs: 1_000 + 5 * 60_000,
          isPaused: false,
        }),
      })
    )
  })

  it('心跳正常时只刷新最后活跃时间', async () => {
    const fresh = makeProgress({
      lastResumedAt: new Date(Date.now() - 10_000),
      updatedAt: new Date(Date.now() - 5_000),
    })
    prismaMock.classAssignmentProblemProgress.findMany.mockResolvedValue([fresh])

    await heartbeatTiming('assignment-1', 'problem-1', 'user-1')

    const updateArg = prismaMock.classAssignmentProblemProgress.update.mock.calls[0][0]
    expect(Object.keys(updateArg.data)).toEqual(['updatedAt'])
    expect(Date.now() - updateArg.data.updatedAt.getTime()).toBeLessThan(STALE_MS)
  })

  it('完成计时时失联会话只累计到最后活跃时间', async () => {
    const stale = makeProgress({
      lastResumedAt: new Date(Date.now() - 10 * 60_000),
      updatedAt: new Date(Date.now() - 5 * 60_000),
    })
    prismaMock.classAssignmentProblemProgress.findMany.mockResolvedValue([stale])

    const finalTime = await finalizeTiming('assignment-1', 'problem-1', 'user-1')

    expect(finalTime).toBe(1_000 + 5 * 60_000)
    expect(prismaMock.classAssignmentProblemProgress.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          finalTimeMs: 1_000 + 5 * 60_000,
          completedAt: expect.any(Date),
        }),
      })
    )
  })
})
