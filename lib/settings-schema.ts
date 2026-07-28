/**
 * lib/settings-schema.ts
 * 系统设置 PUT 请求体 Zod 校验（拒绝未知字段、约束类型与范围）
 */
import { z } from 'zod'
import { defaultJudgeSettings } from '@/lib/settings-defaults'

const failFastSchema = z.enum(['off', 'hard', 'all'])

const judgeSettingsSchema = z
  .object({
    jobTimeout: z.number().int().min(30).max(3600).optional(),
    failFast: failFastSchema.optional(),
    maxConcurrent: z.number().int().min(1).max(16).optional(),
    caseConcurrency: z.number().int().min(0).max(16).optional(),
    largeCaseConcurrency: z.number().int().min(1).max(8).optional(),
    rejudgeTimes: z.number().int().min(0).max(5).optional(),
    extraTimeRatio: z.number().min(0).max(1).optional(),
    compileTimeout: z.number().int().min(5000).max(120000).optional(),
    ioSlackMaxMs: z.number().int().min(5000).max(120000).optional(),
    deadCheckMs: z.number().int().min(2000).max(30000).optional(),
    closeFallbackMs: z.number().int().min(200).max(5000).optional(),
    largeCaseBytes: z
      .number()
      .int()
      .min(256 * 1024)
      .max(64 * 1024 * 1024)
      .optional(),
  })
  .strict()

export const systemSettingsUpdateSchema = z
  .object({
    siteName: z.string().max(100).optional(),
    siteDescription: z.string().max(500).optional(),
    allowRegistration: z.boolean().optional(),
    allowGuestSubmission: z.boolean().optional(),
    defaultLanguage: z.enum(['cpp', 'c', 'python']).optional(),
    maxSubmissionSize: z.number().int().min(1024).max(512 * 1024).optional(),
    smtpHost: z.string().max(253).optional(),
    smtpPort: z.number().int().min(1).max(65535).optional(),
    smtpUser: z.string().max(200).optional(),
    smtpFrom: z.string().max(200).optional(),
    smtpPassword: z.string().max(500).optional(),
    smtpSecure: z.boolean().optional(),
    judge: judgeSettingsSchema.optional(),
  })
  // 默认 strip：忽略前端回传的 message 等非配置字段，同时校验已知字段类型

export type SystemSettingsUpdateInput = z.infer<typeof systemSettingsUpdateSchema>

/** 校验失败时抛出带字段路径的 Error */
export function parseSystemSettingsUpdate(body: unknown): SystemSettingsUpdateInput {
  const result = systemSettingsUpdateSchema.safeParse(body)
  if (!result.success) {
    const detail = result.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ')
    throw new Error(`设置参数不合法: ${detail}`)
  }
  // 确保 judge 部分与默认字段集合一致（未知键已由 .strict() 拒绝）
  if (result.data.judge) {
    for (const key of Object.keys(result.data.judge)) {
      if (!(key in defaultJudgeSettings)) {
        throw new Error(`未知的评测配置项: ${key}`)
      }
    }
  }
  return result.data
}
