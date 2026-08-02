/**
 * lib/report/service.ts
 * 内容举报（安全合规：投诉举报机制）
 *
 * 现状：仅接入 SOLUTION（题解）。targetType 白名单见 REPORT_TARGET_TYPES。
 */
import { prisma } from '@/lib/prisma'
import { AppError } from '@/lib/errors'
import { cache } from '@/lib/cache'
import type { Prisma } from '@prisma/client'
import { DEFAULT_PAGE_SIZE, type ListOptions, type PaginatedResult } from '@/lib/types/common'

export const REPORT_TARGET_TYPES = ['SOLUTION'] as const
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number]

export const REPORT_REASONS = ['违法有害信息', '侵权内容', '垃圾广告', '其他'] as const
export type ReportReason = (typeof REPORT_REASONS)[number]

export interface CreateReportInput {
  targetType: string
  targetId: string
  reason: string
  detail?: string
}

/**
 * 创建举报（登录用户）。校验：类型/原因白名单、目标存在、不能举报自己、同一目标不重复待处理举报
 */
export async function createReport(input: CreateReportInput, reporterId: string) {
  if (!(REPORT_TARGET_TYPES as readonly string[]).includes(input.targetType)) {
    throw AppError.badRequest('VALIDATION', '不支持的举报类型')
  }
  if (!(REPORT_REASONS as readonly string[]).includes(input.reason)) {
    throw AppError.badRequest('VALIDATION', '无效的举报原因')
  }
  if (input.detail && input.detail.length > 500) {
    throw AppError.badRequest('VALIDATION', '补充说明不能超过 500 字')
  }

  let targetTitle: string | null = null
  if (input.targetType === 'SOLUTION') {
    const solution = await prisma.solution.findUnique({
      where: { id: input.targetId },
      select: { id: true, title: true, authorId: true },
    })
    if (!solution) throw AppError.notFound('题解不存在')
    if (solution.authorId === reporterId) {
      throw AppError.badRequest('VALIDATION', '不能举报自己的内容')
    }
    targetTitle = solution.title
  }

  const existing = await prisma.contentReport.findFirst({
    where: {
      targetType: input.targetType,
      targetId: input.targetId,
      reporterId,
      status: 'pending',
    },
    select: { id: true },
  })
  if (existing) {
    throw AppError.conflict('该内容你已举报，正在处理中')
  }

  return prisma.contentReport.create({
    data: {
      targetType: input.targetType,
      targetId: input.targetId,
      targetTitle,
      reason: input.reason,
      detail: input.detail?.trim() || null,
      reporterId,
    },
  })
}

export interface ReportFilter {
  status?: string // pending / resolved / dismissed / all
}

/**
 * 管理后台：分页列出举报（按状态过滤）
 */
export async function listReports(
  filter: ReportFilter = {},
  options: ListOptions = {}
): Promise<PaginatedResult<Prisma.ContentReportGetPayload<{ include: { reporter: { select: { id: true; username: true; nickname: true } } } }>>> {
  const page = options.page ?? 1
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
  const where: Prisma.ContentReportWhereInput = {}
  if (filter.status && filter.status !== 'all') {
    where.status = filter.status
  }
  const [items, total] = await Promise.all([
    prisma.contentReport.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        reporter: { select: { id: true, username: true, nickname: true } },
      },
    }),
    prisma.contentReport.count({ where }),
  ])
  return { items, total, page, pageSize }
}

export type ReportHandleAction = 'resolved' | 'dismissed'

export interface HandleReportInput {
  status: ReportHandleAction
  handleNote?: string
  /** 是否同时删除被举报内容（当前仅 SOLUTION 支持） */
  deleteTarget?: boolean
}

/**
 * 管理后台：处理举报（标记已处理 / 驳回）。删除目标内容时留痕到处理备注。
 */
export async function handleReport(id: string, handlerId: string, input: HandleReportInput) {
  const report = await prisma.contentReport.findUnique({ where: { id } })
  if (!report) throw AppError.notFound('举报记录不存在')

  const notes: string[] = []
  if (input.handleNote?.trim()) notes.push(input.handleNote.trim().slice(0, 500))

  if (input.deleteTarget && report.targetType === 'SOLUTION') {
    const solution = await prisma.solution.findUnique({
      where: { id: report.targetId },
      select: { id: true, title: true },
    })
    if (solution) {
      await prisma.solution.delete({ where: { id: solution.id } })
      cache.delete(`solution:byId:${solution.id}`)
      cache.deleteByPrefix('solution:list')
      notes.push(`已删除被举报内容「${solution.title}」`)
    }
  }

  return prisma.contentReport.update({
    where: { id },
    data: {
      status: input.status,
      handleNote: notes.length ? notes.join('；') : null,
      handlerId,
      handledAt: new Date(),
    },
  })
}
