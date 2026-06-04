# AI 题目自动验证 + 自动发布 - 验收清单

## 阶段一：数据模型

- [ ] [prisma/schema.prisma](file:///e:/桌面/oj/prisma/schema.prisma) `Problem` 模型含 `aiStatus` 字段
- [ ] [prisma/schema.prisma](file:///e:/桌面/oj/prisma/schema.prisma) `Problem` 模型含 `verifiedAt` 字段
- [ ] [prisma/schema.prisma](file:///e:/桌面/oj/prisma/schema.prisma) `Problem` 模型含 `judgeStatus` 字段
- [ ] [prisma/schema.prisma](file:///e:/桌面/oj/prisma/schema.prisma) `Problem` 模型含 `judgeMessage` 字段
- [ ] [prisma/schema.prisma](file:///e:/桌面/oj/prisma/schema.prisma) `Problem` 模型含 `fixAttempts` 字段
- [ ] [prisma/schema.prisma](file:///e:/桌面/oj/prisma/schema.prisma) `Solution` 模型含 `verified` 字段
- [ ] [prisma/schema.prisma](file:///e:/桌面/oj/prisma/schema.prisma) `Solution` 模型含 `verifiedAt` 字段
- [ ] `npx prisma generate` 成功
- [ ] `npx prisma db push` 成功（MongoDB 字段已同步）

## 阶段二：后端端点（自动修正循环）

- [ ] [lib/ai/regenerate-solution.ts](file:///e:/桌面/oj/lib/ai/regenerate-solution.ts) 存在
- [ ] `regenerateSolution(problemContext, failedTest, modelId)` 函数正确调用 DeepSeek 重写标程
- [ ] [app/api/admin/ai/save-and-verify/route.ts](file:///e:/桌面/oj/app/api/admin/ai/save-and-verify/route.ts) 存在
- [ ] 端点 `POST` 方法 admin 鉴权
- [ ] 端点内部调用 `executeJudge()` 跑标程（非 AI 模拟）
- [ ] **AC + 一次通过** → `isPublic = true, aiStatus = 'VERIFIED', fixAttempts = 0, verifiedAt = now()`
- [ ] **AC + 修正后通过**（attempts > 0）→ `isPublic = true, aiStatus = 'VERIFIED', fixAttempts = N`
- [ ] **3 次修正仍失败** → `isPublic = true, aiStatus = 'AUTO_PUBLISHED_WITH_FAILURES', fixAttempts = 3`
- [ ] 失败时 `judgeStatus` + `judgeMessage` 记录最后一次失败
- [ ] 失败时 `Solution.verified = false`（不向用户暴露未验证标程）
- [ ] 评测超时 30s 按 TLE 处理
- [ ] 修正循环上限 3 次（不无限循环）
- [ ] 端点返回 `{ success, problemId?, attempts, judgeResult, warning? }`

## 阶段三：抽离 save 函数

- [ ] [lib/ai/save-problem.ts](file:///e:/桌面/oj/lib/ai/save-problem.ts) 存在
- [ ] `saveProblem(user, problem, logId, tx?)` 内部函数可复用
- [ ] save 路由与 save-and-verify 路由都调用此函数
- [ ] save 路由保留为"草稿"路径（前端可选调用）

## 阶段四：前端 UI

- [ ] [app/admin/ai-generation/page.tsx](file:///e:/桌面/oj/app/admin/ai-generation/page.tsx) 有"创建并自动发布"按钮
- [ ] 点击按钮后展示 6 步进度（保存 / 编译 / 运行 / 修正 / 重验证 / 公开）
- [ ] **成功（attempts = 0）**：绿色 ✓ "已自动公开到题库（首次验证通过）"
- [ ] **修正后成功（attempts > 0）**：黄色 ✓ "AI 修正 N 次后通过" + 修正历史展开
- [ ] **部分成功**：橙色 ⚠ "已自动入库，但标程未通过验证" + 警告文字
- [ ] **完全失败**：红色 ✗ + "保留为草稿"按钮
- [ ] 成功结果显示"查看题目"按钮（链到 `/problem/{id}`）
- [ ] 成功结果显示"查看题解"按钮（链到 `/problem/{id}#solutions`）
- [ ] WA 时显示 failedTest 的 expected vs actual
- [ ] 移除之前"重新生成标程"按钮和代码

## 阶段五：审核页调整

- [ ] [app/admin/problems/review/](file:///e:/桌面/oj/app/admin/problems/review/) 列表**不展示**任何 AI 生成的题目
- [ ] 列表**仅展示** `isAiGenerated = false` 的手动提交题目
- [ ] 移除"强制公开"按钮
- [ ] 移除"删除"按钮或保留作为管理员工具

## 阶段六：AI 题目状态可见性

- [ ] [app/admin/problems/](file:///e:/桌面/oj/app/admin/problems/) 列表展示 `aiStatus` 徽章
  - 'VERIFIED' → 绿色 ✓
  - 'AUTO_PUBLISHED_WITH_FAILURES' → 橙色 ⚠ "标程未验证"
- [ ] 题目详情页展示 `aiStatus`、`judgeStatus`、`fixAttempts`、`verifiedAt` 字段
- [ ] 详情页对 `AUTO_PUBLISHED_WITH_FAILURES` 显示红色警告"标程未通过验证"

## 阶段七：端到端

- [ ] 重启 dev server
- [ ] 触发 AI 出题（完成 simplify-ai-generation-flow 之后）
- [ ] 点"创建并自动发布"
- [ ] 进度条 6 步依次完成
- [ ] 成功时"查看题目"按钮可点开
- [ ] 题目页可见，isPublic = true
- [ ] 题解页可见 AI 标程（verified = true）
- [ ] 故意构造 wrong solution（SQL 改）→ AI 自动修正 → 通过（attempts = 1）
- [ ] 构造**永远错**的 solution（输出 0） → 3 次修正失败 → 题目公开但无 verified 标程
- [ ] 审核页打开后，AI 题目**不在**列表中
- [ ] 题目详情页对 `AUTO_PUBLISHED_WITH_FAILURES` 显示橙色徽章

## 代码质量

- [ ] `npx tsc --noEmit` 0 错误
- [ ] `git status` 无未提交变更
- [ ] AI 出题页 1 个"开始生成"按钮 + 1 个"创建并自动发布"按钮
- [ ] 审核页只展示手动提交题目
- [ ] 题目列表对 AI 题目显示状态徽章
