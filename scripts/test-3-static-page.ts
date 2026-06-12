/**
 * 前端 AI 出题页面静态检查
 *
 * 读取 [app/admin/ai-generation/page.tsx](file:///e:/桌面/oj/app/admin/ai-generation/page.tsx)，
 * 断言含 12+ 个关键 UI 元素 + 0 个已删除字符串 + 0 个刚清理字符串
 *
 * 用法: npx tsx scripts/test-3-static-page.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PAGE_PATH = path.resolve(__dirname, '..', 'app', 'assistant', 'ai-generation', 'page.tsx')

interface TestCase {
  name: string
  fn: () => void
}

let pageContent = ''
try {
  pageContent = fs.readFileSync(PAGE_PATH, 'utf-8')
} catch (e: any) {
  console.error(`❌ 无法读取 ${PAGE_PATH}: ${e.message}`)
  process.exit(1)
}

const cases: TestCase[] = [
  // ===== 关键 UI 元素存在性 =====
  {
    name: '✅ 关键 UI: 模型选择（"AI 模型"）',
    fn: () => {
      if (!pageContent.includes('AI 模型')) {
        throw new Error('未找到 "AI 模型" 标签')
      }
    }
  },
  {
    name: '✅ 关键 UI: 主题输入（"题目主题"）',
    fn: () => {
      if (!pageContent.includes('题目主题')) {
        throw new Error('未找到 "题目主题" 标签')
      }
    }
  },
  {
    name: '✅ 关键 UI: 8 个 quick topic chip',
    fn: () => {
      const required = ['动态规划', '图论', '最短路', '二分', '字符串', '贪心', 'DFS/BFS', '数据结构']
      for (const t of required) {
        if (!pageContent.includes(t)) throw new Error(`quick topic 缺: ${t}`)
      }
    }
  },
  {
    name: '✅ 关键 UI: 8 个难度档位网格（入门/普及-/普及/普及+/提高/提高+/省选/NOI）',
    fn: () => {
      const required = ['入门', '普及-', '普及', '普及+', '提高', '提高+', '省选', 'NOI']
      for (const d of required) {
        if (!pageContent.includes(d)) throw new Error(`难度缺: ${d}`)
      }
    }
  },
  {
    name: '🚫 已移除: 生成数量选择器 "1 道 / 2 道 / 3 道"（业务决策 2026-06）',
    fn: () => {
      // 这些是已废弃按钮的文字，必须不再出现
      // 业务决策 2026-06：单次调用固定 1 道，UI 用 "一道" 中文表述
      const forbidden = ['2 道', '3 道', '生成数量', 'setCount', '{n} 道', '[1, 2, 3]']
      for (const f of forbidden) {
        if (pageContent.includes(f)) {
          throw new Error(`不应再含 "${f}"（业务决策 2026-06 单题模式）`)
        }
      }
      // 阿拉伯数字 + 道 出现在配置 UI 中即视为数量选择器残留
      if (pageContent.match(/[\s"'`](\d)\s*道[\s"'`,]/)) {
        throw new Error('不应在 UI 文案中出现阿拉伯数字+道的选择器')
      }
      // 同时确认源码中也不再有 [1, 2, 3] 数量数组
      if (pageContent.match(/\[1,\s*2,\s*3\]/)) {
        throw new Error('不应再有数量数组 [1, 2, 3]')
      }
    }
  },
  {
    name: '✅ 关键 UI: 单题模式提示 "单次生成一道题 · 可同时提交多个独立任务"',
    fn: () => {
      const required = ['单次生成一道题', '可同时提交多个独立任务']
      for (const w of required) {
        if (!pageContent.includes(w)) throw new Error(`缺并发提示文案: ${w}`)
      }
    }
  },
  {
    name: '✅ 关键 UI: 页面副标题含并发说明 "可多次点击「开始生成」并发生成"',
    fn: () => {
      if (!pageContent.includes('可多次点击')) {
        throw new Error('缺并发副标题文案')
      }
    }
  },
  {
    name: '✅ 关键 UI: "开始生成" / "再生成一道" 按钮（动态文案：有 active 任务时变体）',
    fn: () => {
      if (!pageContent.includes('开始生成')) throw new Error('缺 "开始生成" 按钮')
      if (!pageContent.includes('再生成一道')) throw new Error('缺并发变体 "再生成一道"')
      if (!pageContent.includes('activeJobs.size')) throw new Error('缺 activeJobs.size 动态判断')
    }
  },
  {
    name: '✅ 关键 UI: "N 个任务进行中" 计数器（activeJobs 数量）',
    fn: () => {
      if (!pageContent.includes('N 个任务进行中') && !pageContent.includes('个任务进行中') && !pageContent.includes('个进行中')) {
        throw new Error('缺并发计数器文案')
      }
    }
  },
  {
    name: '✅ 关键 UI: "取消此任务" 按钮（按任务维度的 cancelJob）',
    fn: () => {
      if (!pageContent.includes('取消此任务')) throw new Error('缺 "取消此任务" 按钮')
    }
  },
  {
    name: '✅ 关键 UI: 附加要求 textarea',
    fn: () => {
      if (!pageContent.includes('附加要求')) throw new Error('缺 "附加要求"')
      if (!pageContent.match(/<textarea/)) throw new Error('缺 textarea 元素')
    }
  },
  {
    name: '✅ 关键 UI: "开始生成" 按钮',
    fn: () => {
      if (!pageContent.includes('开始生成')) throw new Error('缺 "开始生成" 按钮')
    }
  },
  {
    name: '✅ 关键 UI: 2 步工作流（配置参数 / AI 生成）— 业务决策 2026-06 移除"自动发布"步骤',
    fn: () => {
      const required = ['配置参数', 'AI 生成']
      for (const w of required) {
        if (!pageContent.includes(w)) throw new Error(`工作流步骤缺: ${w}`)
      }
      // 业务决策：发布已并入 queue.ts 后台自动保存，前端不再展示"自动发布"步骤
      const forbidden = ['创建并自动发布', '正在自动发布', '保留为草稿']
      for (const f of forbidden) {
        if (pageContent.includes(f)) throw new Error(`不应再出现已移除的文案: ${f}`)
      }
    }
  },
  {
    name: '✅ 关键 UI: 成功后展示"已生成 N 道题并发布到公开题库" + "在题库中查看" 按钮',
    fn: () => {
      const required = ['已生成', '并发布到公开题库', '在题库中查看']
      for (const w of required) {
        if (!pageContent.includes(w)) throw new Error(`缺成功提示文案: ${w}`)
      }
    }
  },
  {
    name: '🚫 已移除: "重新生成" 按钮（业务决策 2026-06 已并入"再生成 1 道"）',
    fn: () => {
      // 旧的"重新生成"按钮已移除；新的并发按钮是"再生成 1 道"
      if (pageContent.match(/>\s*重新生成\s*</)) {
        throw new Error('不应再有 "重新生成" 按钮（已并入"再生成 1 道"）')
      }
    }
  },
  {
    name: '✅ 关键 UI: "生成记录" 按钮',
    fn: () => {
      if (!pageContent.includes('生成记录')) throw new Error('缺 "生成记录" 按钮')
    }
  },
  {
    name: '✅ 关键 UI: "重试" 按钮（失败卡片上的重试）',
    fn: () => {
      if (!pageContent.includes('重试')) throw new Error('缺 "重试" 按钮')
    }
  },
  {
    name: '✅ 关键 UI: 防误触冷却（DEBOUNCE_MS 1500ms + 请稍候倒计时）',
    fn: () => {
      if (!pageContent.includes('DEBOUNCE_MS')) throw new Error('缺 DEBOUNCE_MS 防误触常量')
      if (!pageContent.includes('triggerCooldown')) throw new Error('缺 triggerCooldown 冷却触发函数')
      if (!pageContent.includes('cooldownUntilRef')) throw new Error('缺 cooldownUntilRef 冷却时间戳 ref')
      if (!pageContent.includes('请稍候')) throw new Error('缺"请稍候"倒计时 UI 文案')
      if (!pageContent.includes('cooldown > 0')) throw new Error('缺 cooldown 状态在按钮 disabled/文案 中的判断')
    }
  },
  {
    name: '🚫 已移除: "卡住了？取消轮询" 按钮（业务决策 2026-06 改为 per-task 取消）',
    fn: () => {
      if (pageContent.includes('卡住了')) {
        throw new Error('不应再有 "卡住了？取消轮询" 按钮（已改为 per-task 取消）')
      }
      if (pageContent.includes('handleCancelPolling')) {
        throw new Error('不应再有 handleCancelPolling 函数（已删除）')
      }
    }
  },

  // ===== 已删除字符串（必须 0 匹配）=====
  {
    name: '🚫 不含已删除字符串: "仅生成题目描述"',
    fn: () => {
      if (pageContent.includes('仅生成题目描述')) {
        throw new Error('不应再含 "仅生成题目描述"（已删除拆分生成功能）')
      }
    }
  },
  {
    name: '🚫 不含已删除字符串: "补全测试数据"',
    fn: () => {
      if (pageContent.includes('补全测试数据')) {
        throw new Error('不应再含 "补全测试数据"（已删除拆分生成功能）')
      }
    }
  },
  {
    name: '🚫 不含已删除字符串: "skipTestCases"',
    fn: () => {
      if (pageContent.includes('skipTestCases')) {
        throw new Error('不应再含 "skipTestCases"（已删除）')
      }
    }
  },
  {
    name: '🚫 不含已删除字符串: "handleGenerateTestCases"',
    fn: () => {
      if (pageContent.includes('handleGenerateTestCases')) {
        throw new Error('不应再含 "handleGenerateTestCases"（已删除）')
      }
    }
  },

  // ===== 刚清理字符串（必须 0 匹配）=====
  {
    name: '🚫 不含刚清理字符串: "text_based"',
    fn: () => {
      if (pageContent.includes('text_based')) {
        throw new Error('不应再含 "text_based"（Clone/Similar 模式已清理）')
      }
    }
  },
  {
    name: '🚫 不含刚清理字符串: "textModeType"',
    fn: () => {
      if (pageContent.includes('textModeType')) {
        throw new Error('不应再含 "textModeType"（Clone/Similar 模式已清理）')
      }
    }
  },
  {
    name: '🚫 不含刚清理字符串: "optimizeDescription"',
    fn: () => {
      if (pageContent.includes('optimizeDescription')) {
        throw new Error('不应再含 "optimizeDescription"（Clone/Similar 模式已清理）')
      }
    }
  },

  // ===== API 路由探测 =====
  {
    name: '✅ API 路由存在: /api/admin/ai/generate',
    fn: () => {
      const p = path.resolve(__dirname, '..', 'app', 'api', 'assistant', 'ai', 'generate', 'route.ts')
      if (!fs.existsSync(p)) throw new Error('route.ts 不存在')
    }
  },
  {
    name: '🚫 已移除: /api/admin/ai/save 路由不应存在（业务决策 2026-06）',
    fn: () => {
      const p = path.resolve(__dirname, '..', 'app', 'api', 'assistant', 'ai', 'save', 'route.ts')
      if (fs.existsSync(p)) throw new Error('save/route.ts 不应再存在，请删除')
    }
  },
  {
    name: '🚫 已移除: /api/admin/ai/save-and-verify 路由不应存在（业务决策 2026-06）',
    fn: () => {
      const p = path.resolve(__dirname, '..', 'app', 'api', 'assistant', 'ai', 'save-and-verify', 'route.ts')
      if (fs.existsSync(p)) throw new Error('save-and-verify/route.ts 不应再存在，请删除')
    }
  },
  {
    name: '✅ API 路由存在: /api/admin/ai/models',
    fn: () => {
      const p = path.resolve(__dirname, '..', 'app', 'api', 'assistant', 'ai', 'models', 'route.ts')
      if (!fs.existsSync(p)) throw new Error('models/route.ts 不存在')
    }
  },

  // ===== 移除验证状态 + 人工审核（spec: remove-verification-status-and-manual-review）=====
  {
    name: '🚫 题目列表页无"需验证"红色 badge（业务决策 2026-06 移除验证状态）',
    fn: () => {
      const p = path.resolve(__dirname, '..', 'app', 'assistant', 'problems', 'page.tsx')
      const c = fs.readFileSync(p, 'utf-8')
      if (c.includes('需验证')) {
        throw new Error('app/admin/problems/page.tsx 不应再含"需验证" badge')
      }
    }
  },
  {
    name: '🚫 题目列表页无"已验证"绿色 badge',
    fn: () => {
      const p = path.resolve(__dirname, '..', 'app', 'assistant', 'problems', 'page.tsx')
      const c = fs.readFileSync(p, 'utf-8')
      if (c.match(/[>'"]\s*已验证\s*[<'"<]/)) {
        throw new Error('app/admin/problems/page.tsx 不应再含"已验证" badge')
      }
    }
  },
  {
    name: '🚫 题目列表页无"标程未验证"橙色 badge',
    fn: () => {
      const p = path.resolve(__dirname, '..', 'app', 'assistant', 'problems', 'page.tsx')
      const c = fs.readFileSync(p, 'utf-8')
      if (c.includes('标程未验证')) {
        throw new Error('app/admin/problems/page.tsx 不应再含"标程未验证" badge')
      }
    }
  },
  {
    name: '🚫 题目列表页无"验证中"PENDING badge',
    fn: () => {
      const p = path.resolve(__dirname, '..', 'app', 'assistant', 'problems', 'page.tsx')
      const c = fs.readFileSync(p, 'utf-8')
      if (c.match(/>\s*验证中\s*</)) {
        throw new Error('app/admin/problems/page.tsx 不应再含"验证中" badge（PENDING 状态已废弃）')
      }
    }
  },
  {
    name: '🚫 题目列表页不再以 aiStatus === VERIFIED / AUTO_PUBLISHED_WITH_FAILURES 渲染 badge',
    fn: () => {
      const p = path.resolve(__dirname, '..', 'app', 'assistant', 'problems', 'page.tsx')
      const c = fs.readFileSync(p, 'utf-8')
      if (c.includes("aiStatus === 'VERIFIED'") || c.includes("aiStatus === 'AUTO_PUBLISHED_WITH_FAILURES'")) {
        throw new Error('不应再按 aiStatus VERIFIED / AUTO_PUBLISHED_WITH_FAILURES 渲染 badge')
      }
    }
  },
  {
    name: '🚫 侧边栏 AdminLayout 无"题目审核"菜单项',
    fn: () => {
      const p = path.resolve(__dirname, '..', 'components', 'AdminLayout.tsx')
      const c = fs.readFileSync(p, 'utf-8')
      if (c.includes('题目审核')) {
        throw new Error('AdminLayout.tsx 不应再含"题目审核"菜单项')
      }
      if (c.includes('/admin/problems/review')) {
        throw new Error('AdminLayout.tsx 不应再引用 /admin/problems/review 路径')
      }
    }
  },
  {
    name: '🚫 题目来源页无"验证状态"列 + 无"已验证" tag',
    fn: () => {
      const p = path.resolve(__dirname, '..', 'app', 'assistant', 'problems', 'source', 'page.tsx')
      const c = fs.readFileSync(p, 'utf-8')
      if (c.includes('验证状态')) {
        throw new Error('source/page.tsx 不应再含"验证状态"列')
      }
      if (c.match(/>\s*已验证\s*</)) {
        throw new Error('source/page.tsx 不应再含"已验证" tag')
      }
    }
  },
  {
    name: '🚫 testcases 页无"isVerified" 本地 state + 无"标记为已验证"提示',
    fn: () => {
      const p = path.resolve(__dirname, '..', 'app', 'assistant', 'problems', '[id]', 'testcases', 'page.tsx')
      const c = fs.readFileSync(p, 'utf-8')
      if (c.match(/\bisVerified\b/) || c.match(/\bsetIsVerified\b/)) {
        throw new Error('testcases/page.tsx 不应再有 isVerified / setIsVerified 引用')
      }
      if (c.includes('标记为"已验证"')) {
        throw new Error('testcases/page.tsx 不应再含"标记为已验证"提示文案')
      }
    }
  },
  {
    name: '🚫 Prisma schema 移除 isVerified / verifiedAt / judgeStatus / judgeMessage / fixAttempts 字段',
    fn: () => {
      const p = path.resolve(__dirname, '..', 'prisma', 'schema.prisma')
      const c = fs.readFileSync(p, 'utf-8')
      const forbiddenFields = ['isVerified', 'verifiedAt', 'judgeStatus', 'judgeMessage', 'fixAttempts']
      for (const f of forbiddenFields) {
        // 在 Problem / Solution 模型的字段声明中不应再出现
        // 用单词边界 + Prisma 字段语法匹配
        if (c.match(new RegExp(`\\b${f}\\b\\s+(Boolean|DateTime|String|Int)\\b`))) {
          throw new Error(`schema.prisma 不应再声明字段 ${f}`)
        }
      }
    }
  },
  {
    name: '🚫 AI 出题页面无 isVerified / verifiedAt / judgeStatus / fixAttempts 引用',
    fn: () => {
      const p = path.resolve(__dirname, '..', 'app', 'assistant', 'ai-generation', 'page.tsx')
      const c = fs.readFileSync(p, 'utf-8')
      for (const f of ['isVerified', 'verifiedAt', 'judgeStatus', 'fixAttempts']) {
        if (c.match(new RegExp(`\\b${f}\\b`))) {
          throw new Error(`ai-generation/page.tsx 不应再引用 ${f}`)
        }
      }
    }
  }
]

let pass = 0
let fail = 0
const failures: Array<{ name: string; reason: string }> = []

for (const tc of cases) {
  try {
    tc.fn()
    pass++
    console.log(`✅ ${tc.name}`)
  } catch (e: any) {
    fail++
    failures.push({ name: tc.name, reason: e?.message || String(e) })
    console.log(`❌ ${tc.name} — ${e?.message || String(e)}`)
  }
}

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
console.log(`📊 测试结果: ${pass} 通过 / ${fail} 失败 / ${cases.length} 总数`)
if (fail > 0) {
  console.log(`\n❌ 失败详情:`)
  for (const f of failures) {
    console.log(`  - ${f.name}: ${f.reason}`)
  }
  process.exit(1)
} else {
  console.log(`\n🎉 全部通过！`)
  process.exit(0)
}
