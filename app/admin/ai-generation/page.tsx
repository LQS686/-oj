'use client'

import { AiWorkspaceShell } from '@/components/ai/AiWorkspaceShell'

/**
 * /admin/ai-generation - 旧路径，保留为路由壳（Phase 4 重构）
 *
 * 原本 ~1197 行的内联逻辑已迁移到 Phase 3 抽取的组件：
 * - AiGenerationForm：出题表单（主题多选 + 难度 + 附加要求 + 提交）
 * - AiResultPanel：生成结果展示（题目 / 测试点 / 标程 / 质量 chip）
 * - AiThinkingTrace：思维过程展示
 *
 * 这里仅渲染 AiWorkspaceShell，行为与 /admin/ai 完全一致（默认激活"智能出题"Tab）。
 * URL query（?tab=xxx&problemId=xxx）由 AiWorkspaceShell 内部同步。
 */
export default function AIGenerationPage() {
  return <AiWorkspaceShell defaultTab="generate" />
}
