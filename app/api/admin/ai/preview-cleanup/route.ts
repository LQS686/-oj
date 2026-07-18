/**
 * /api/admin/ai/preview-cleanup - 清理超时预览任务（Task 27.6）
 *
 * POST 调 cleanupStalePreviewTasks()
 * 扫描超 24 小时未确认的 COMPLETED + isPreview 任务，自动入库
 * 返回 { success: true, data: { committed } }
 *
 * 鉴权：管理员（withApi.admin）
 * 可由管理员手动触发，或由外部 cron 定时调用本端点
 */
import { withApi, ok } from '@/lib/api/withApi'
import { cleanupStalePreviewTasks } from '@/lib/ai/service'

export const POST = withApi.admin(async () => {
  const result = await cleanupStalePreviewTasks()
  return ok(result)
})
