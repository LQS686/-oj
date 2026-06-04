# AI 题目自动验证 + 自动发布 - 任务清单

## 任务总览

按 5 个阶段推进：数据模型 → 后端端点 → 前端 UI → 审核页调整 → 端到端验证。
**关键**：后端要实现"自动修正循环"——失败时调用 AI 重写标程，最多重试 3 次。

## 阶段一：数据模型

### 任务1: 扩展 Prisma Schema [prisma/schema.prisma](file:///e:/桌面/oj/prisma/schema.prisma)
- [ ] 1.1: `Problem` 模型加 `aiStatus String?` 字段（枚举值：'PENDING' | 'VERIFIED' | 'AUTO_PUBLISHED_WITH_FAILURES' | 'DRAFT' | 'FORCE_PUBLISHED'）
- [ ] 1.2: `Problem` 模型加 `verifiedAt DateTime?` 字段
- [ ] 1.3: `Problem` 模型加 `judgeStatus String?` 字段
- [ ] 1.4: `Problem` 模型加 `judgeMessage String?` 字段
- [ ] 1.5: `Problem` 模型加 `fixAttempts Int @default(0)` 字段
- [ ] 1.6: `Solution` 模型加 `verified Boolean @default(false)` 字段
- [ ] 1.7: `Solution` 模型加 `verifiedAt DateTime?` 字段
- [ ] 1.8: 运行 `npx prisma generate` + `npx prisma db push` 同步到 MongoDB

## 阶段二：后端端点（核心：自动修正循环）

### 任务2: 实现 AI 修正标程函数 [lib/ai/regenerate-solution.ts](file:///e:/桌面/oj/lib/ai/regenerate-solution.ts) (新建)
- [ ] 2.1: 导出 `regenerateSolution(problemContext, failedTest, modelId)` 函数
- [ ] 2.2: 构造 prompt：`{title, description, input, output, samples, solution_cpp, judgeStatus, judgeMessage, failedTest}` + 明确指示"修正之前的标程使其通过"
- [ ] 2.3: 调用 DeepSeek 重新生成 solution_cpp（用同一个 `lib/ai/generator.ts` 的 `client.chat.completions.create`）
- [ ] 2.4: 返回新的 solution_cpp 字符串

### 任务3: 新建 save-and-verify 端点（带自动修正循环） [app/api/admin/ai/save-and-verify/route.ts](file:///e:/桌面/oj/app/api/admin/ai/save-and-verify/route.ts) (新建)
- [ ] 3.1: 路由签名 `POST(request: NextRequest)`，admin 鉴权
- [ ] 3.2: 解构 `problems[]` + `logId`
- [ ] 3.3: 对每个 problem 复用 [app/api/admin/ai/save/route.ts](file:///e:/桌面/oj/app/api/admin/ai/save/route.ts) 的事务代码（建题目 + 写 testCase + 写 Solution 占位，`isPublic = false, aiStatus = 'PENDING'`，**不写** verified = true）
- [ ] 3.4: **自动修正循环**（fixAttempts = 0..3）：
  - [ ] 3.4.1: 调用 [lib/judge/judger.ts](file:///e:/桌面/oj/lib/judge/judger.ts) 的 `executeJudge()` 跑标程
  - [ ] 3.4.2: JudgeResult 解析为 { status, passedTests, totalTests, message, failedTest? }
  - [ ] 3.4.3: status === 'AC' && passed === total → 跳出循环（成功）
  - [ ] 3.4.4: 否则 fixAttempts < 3：
    - 调用 [lib/ai/regenerate-solution.ts](file:///e:/桌面/oj/lib/ai/regenerate-solution.ts) 重写 solution_cpp
    - UPDATE problem SET solution_cpp = newCode
    - fixAttempts++，回到 3.4.1
  - [ ] 3.4.5: try/catch 包裹 AI 重写调用；失败则跳出循环（fixAttempts 保持当前值），进入"完全失败"分支
- [ ] 3.5: **循环结束后分流**：
  - [ ] 3.5.1: 成功（任何一次 AC）：
    - UPDATE problem SET isPublic = true, aiStatus = 'VERIFIED', verifiedAt = now(), judgeStatus = 'AC', fixAttempts = currentAttempts
    - UPDATE solution SET isOfficial = true, verified = true, verifiedAt = now()
    - 重新分配 testCase.score（[lib/testcase-score.ts](file:///e:/桌面/oj/lib/testcase-score.ts)）
    - 返回 { success: true, problemId, attempts, judgeResult }
  - [ ] 3.5.2: 部分成功（3 次修正仍失败）：
    - UPDATE problem SET isPublic = true, aiStatus = 'AUTO_PUBLISHED_WITH_FAILURES', verifiedAt = now(), judgeStatus = finalStatus, judgeMessage = finalMessage, fixAttempts = 3
    - UPDATE solution SET isOfficial = false, verified = false（即使有占位标程也不展示给用户）
    - 重新分配 testCase.score
    - 返回 { success: 'partial', problemId, attempts: 3, judgeResult, warning: '标程未通过验证，已入库但未在题解中显示' }
  - [ ] 3.5.3: 完全失败（AI 重写 API 故障）：
    - problem.isPublic 保持 false, aiStatus = 'DRAFT'
    - 返回 { success: false, error: 'AI 重写标程失败：' + e.message }
- [ ] 3.6: 整体 try/catch 包裹，错误返回 HTTP 500
- [ ] 3.7: 评测超时 30s 按 TLE 处理

### 任务4: 抽离 save 路由为可复用函数 [lib/ai/save-problem.ts](file:///e:/桌面/oj/lib/ai/save-problem.ts) (新建)
- [ ] 4.1: 导出 `saveProblem(user, problem, logId, tx?)` 内部函数，封装 save 路由里的事务逻辑
- [ ] 4.2: save 路由与 save-and-verify 路由都调用此函数

## 阶段三：前端 UI

### 任务5: 改造 AI 出题页"创建"按钮 [app/admin/ai-generation/page.tsx](file:///e:/桌面/oj/app/admin/ai-generation/page.tsx)
- [ ] 5.1: 新增 `handleSaveAndPublish(problemIndex)` 函数，调用 `/api/admin/ai/save-and-verify`
- [ ] 5.2: 新增 `publishing` state（保存当前正在发布的 problemIndex）和 `publishStep` state（6 步进度）
- [ ] 5.3: "创建此题目"按钮文案改为"**创建并自动发布**"
- [ ] 5.4: 按钮点击后显示 6 步进度（保存 → 编译 → 运行 → 修正 → 重验证 → 公开）
- [ ] 5.5: **结果区分流**：
  - [ ] 5.5.1: 成功（attempts = 0）→ 绿色 ✓ + "已自动公开到题库（首次验证通过）" + "查看题目" + "查看题解"
  - [ ] 5.5.2: 修正后成功（attempts > 0）→ 黄色 ✓ + "AI 修正 N 次后通过" + 同样的按钮 + 展开"修正历史"
  - [ ] 5.5.3: 部分成功（success: 'partial'）→ 橙色 ⚠ + "已自动入库，但标程未通过验证" + 警告文字 + "查看题目" + 失败详情
  - [ ] 5.5.4: 完全失败（success: false）→ 红色 ✗ + "保留为草稿"按钮（调用 save 路由）
- [ ] 5.6: "查看题目"按钮：`window.open('/problem/' + id, '_blank')`
- [ ] 5.7: "查看题解"按钮：`window.open('/problem/' + id + '#solutions', '_blank')`
- [ ] 5.8: 移除之前"重新生成标程"按钮和代码（已被自动修正循环取代）

## 阶段四：审核页调整（移除 AI 题目）

### 任务6: 改造审核页过滤 [app/admin/problems/review/](file:///e:/桌面/oj/app/admin/problems/review/)
- [ ] 6.1: GET 路由的 where 条件改为：`{ isAiGenerated: false }`（仅展示手动提交题目）
- [ ] 6.2: 列表**完全移除** AI 题目
- [ ] 6.3: 移除"强制公开"按钮（不再需要）
- [ ] 6.4: 移除"删除"按钮或保留作为管理员工具

### 任务7: AI 题目状态可见性 [app/admin/problems/](file:///e:/桌面/oj/app/admin/problems/)
- [ ] 7.1: 题目列表展示 `aiStatus` 字段对应的徽章：
  - 'VERIFIED' → 绿色 ✓
  - 'AUTO_PUBLISHED_WITH_FAILURES' → 橙色 ⚠ "标程未验证"
  - 'DRAFT' → 灰色
- [ ] 7.2: 题目详情页展示 `aiStatus`、`judgeStatus`、`fixAttempts`、`verifiedAt` 字段
- [ ] 7.3: 详情页对 `AUTO_PUBLISHED_WITH_FAILURES` 显示红色警告"标程未通过验证"

## 阶段五：端到端验证

### 任务8: 跑通端到端
- [ ] 8.1: 重启 dev server
- [ ] 8.2: 触发 AI 出题（完成 simplify-ai-generation-flow 之后）
- [ ] 8.3: 点"创建并自动发布"
- [ ] 8.4: 验证：进度条 6 步依次完成
- [ ] 8.5: 验证：成功时"查看题目"按钮可点开，题目已公开
- [ ] 8.6: 验证：打开"查看题解"页面，能看到 AI 标程（verified = true）
- [ ] 8.7: 验证：故意构造一个 wrong solution（手动 SQL 改 solution_cpp）→ 等待 AI 自动修正（可能 1-3 次）→ 成功
- [ ] 8.8: 验证：构造一个**永远错**的 solution（输出 0） → 3 次修正失败 → 题目仍公开但无 verified 标程
- [ ] 8.9: 验证：审核页打开后，AI 题目**不在**列表中
- [ ] 8.10: 验证：题目详情页对 `AUTO_PUBLISHED_WITH_FAILURES` 显示橙色徽章

## 任务依赖关系

```
任务1 (Schema)
  ├── 任务2 (regenerate-solution 函数)
  │     └── 任务3 (save-and-verify 端点)
  │           ├── 任务4 (抽离 save 函数)
  │           └── 任务5 (前端 UI)
  │                 └── 任务8 (端到端)
  ├── 任务6 (审核页调整) ── 任务8
  └── 任务7 (题目状态可见性) ── 任务8
```

任务1 先做；任务2/6/7 可并行；任务3 在 1+2 完成后；任务4-5 在 3 完成后；任务8 收尾。

## 完成标准

所有 8 个任务的子项勾选完成；`npx tsc --noEmit` 0 错误；端到端流程跑通（包括一次通过、修正后通过、3 次仍失败 3 种场景）。
