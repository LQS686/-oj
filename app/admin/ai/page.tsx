'use client'

import { AiWorkspaceShell } from '@/components/ai/AiWorkspaceShell'
import { AiDisabledNotice } from '@/components/ai/AiDisabledNotice'
import { AI_FEATURE_DISABLED } from '@/lib/ai/feature-flag'

/**
 * /admin/ai - AI 工作区统一入口（Phase 4）
 *
 * URL query 自动同步（由 AiWorkspaceShell 内部处理）：
 * - ?tab=test_data 切换到测试数据生成 Tab
 * - ?tab=analyze&problemId=xxx 切换到题目分析 Tab 并预填 problemId
 * - ?tab=suggest_metadata 切换到元数据建议 Tab
 *
 * 顶部模型选择器、左侧能力 Tab 导航、右下角浮动任务列表均由 AiWorkspaceShell 渲染。
 */
export default function AiWorkspacePage() {
  if (AI_FEATURE_DISABLED) {
    return <AiDisabledNotice />
  }
  return <AiWorkspaceShell defaultTab="generate" />
}
