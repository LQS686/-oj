# Tasks

- [x] Task 1: 扩展 Prisma schema（Solution 模型新增字段）
  - [x] SubTask 1.1: 新增 `isAiGenerated Boolean @default(false)` 字段
  - [x] SubTask 1.2: 新增 `sourceType String @default("USER")` 字段（USER / OFFICIAL / AI_OFFICIAL）
  - [x] SubTask 1.3: 新增 `codeLanguage String?` 字段（重命名原 `language` 字段语义）
  - [x] SubTask 1.4: 确认现有 `code`、`language` 字段保留但语义明确
  - [x] SubTask 1.5: 添加索引 `@@index([problemId, isOfficial])`、`@@index([problemId, createdAt])`
  - [x] SubTask 1.6: 新增 `SolutionView` 模型（views 去重）+ `@@unique([solutionId, viewerKey])`

- [ ] Task 2: 创建题解权限控制工具函数
  - [ ] SubTask 2.1: `lib/solution/permissions.ts` 导出 `canViewSolutions(userId, problemId)`
  - [ ] SubTask 2.2: 查询 Submission 表最高分，判断 `>= 60` 才允许
  - [ ] SubTask 2.3: 管理员/教师直接放行
  - [ ] SubTask 2.4: 单元测试覆盖三类角色

- [x] Task 3: 创建题解 API 路由（CRUD + like）
  - [ ] SubTask 3.1: `GET /api/solutions?problemId=xxx` 列表（带权限校验）
  - [ ] SubTask 3.2: `GET /api/solutions/[id]` 详情
  - [ ] SubTask 3.3: `POST /api/solutions` 创建（登录校验）
  - [ ] SubTask 3.4: `PATCH /api/solutions/[id]` 更新（作者或管理员）
  - [ ] SubTask 3.5: `DELETE /api/solutions/[id]` 删除（作者或管理员）
  - [ ] SubTask 3.6: `POST /api/solutions/[id]/like` 点赞
  - [ ] SubTask 3.7: `GET /api/solutions/[id]/comments` 复用现有 `Comment` 模型

- [x] Task 4: 实现 markdown 渲染组件
  - [ ] SubTask 4.1: `components/solution/MarkdownRenderer.tsx` 封装 `react-markdown`
  - [ ] SubTask 4.2: 启用 `remark-gfm`（表格、删除线、任务列表）
  - [ ] SubTask 4.3: 启用 `remark-math` + `rehype-katex`（数学公式）
  - [ ] SubTask 4.4: 集成 `react-syntax-highlighter` 代码块（支持 C++/Java/Python/JS/Go）
  - [ ] SubTask 4.5: 自定义样式（暗色主题、标题层级、行内代码）

- [ ] Task 5: 实现 markdown 编辑器组件
  - [ ] SubTask 5.1: `components/solution/MarkdownEditor.tsx` 左右分栏（编辑+预览）
  - [ ] SubTask 5.2: 工具栏按钮：粗体/斜体/标题 H1-H3/列表/代码块/公式/链接/图片
  - [ ] SubTask 5.3: 防抖预览（300ms）
  - [ ] SubTask 5.4: 字数统计 + 提交按钮（空内容/长度 < 10 禁用）
  - [ ] SubTask 5.5: 复用 `MarkdownRenderer` 组件做预览

- [ ] Task 6: 创建题解查看页与列表 tab
  - [ ] SubTask 6.1: `app/problems/[id]/solutions/[solutionId]/page.tsx` 详情页
  - [ ] SubTask 6.2: `app/problems/[id]/solutions/page.tsx` 题解列表页（含分页）
  - [ ] SubTask 6.3: 题目详情页 `app/problem/[id]/page.tsx` 集成 `solutions` tab 新组件
  - [ ] SubTask 6.4: tab 内显示题解卡片列表（标题、作者、日期、代码语言、AI 徽章）

- [x] Task 7: 创建题解编辑/发布页
  - [ ] SubTask 7.1: `app/problems/[id]/solutions/new/page.tsx` 发布页
  - [ ] SubTask 7.2: `app/problems/[id]/solutions/[solutionId]/edit/page.tsx` 编辑页
  - [ ] SubTask 7.3: 表单字段：title、content（编辑器）、language、code（独立代码区域，可选）
  - [ ] SubTask 7.4: 提交后跳转回题解详情页

- [ ] Task 8: AI 题解生成模块
  - [ ] SubTask 8.1: `lib/ai/solution-generator.ts` 编写 prompt 模板（基于题目描述 + stdCode + stdLang）
  - [ ] SubTask 8.2: 复用 `lib/ai/generator.ts` 调用方式
  - [ ] SubTask 8.3: 入队逻辑：调用 `lib/ai/queue.ts` 的 enqueue
  - [ ] SubTask 8.4: 结果落库：创建 `Solution` 记录并标记 `isAiGenerated=true`、`isOfficial=true`、`sourceType=AI_OFFICIAL`

- [ ] Task 9: 题目创建触发 AI 题解
  - [ ] SubTask 9.1: 修改 `app/api/admin/problems/route.ts` POST 处理，创建成功后入队
  - [ ] SubTask 9.2: 题目创建响应中返回 `solutionGenerationStatus: "queued"`
  - [ ] SubTask 9.3: 题目编辑页增加"AI 重新生成题解"按钮（管理员可见）

- [ ] Task 10: AI 标识 UI
  - [ ] SubTask 10.1: `components/solution/SolutionCard.tsx` 中根据 `isAiGenerated` 渲染徽章
  - [ ] SubTask 10.2: 详情页顶部展示"🤖 AI 生成"标识
  - [ ] SubTask 10.3: 后端 API 在返回时确保 `isAiGenerated` 字段始终包含

- [ ] Task 11: 作业场景隐藏题解
  - [ ] SubTask 11.1: `app/problem/[id]/page.tsx` 在 `fromAssignment=1` 时不渲染 solutions tab
  - [ ] SubTask 11.2: 后端 API 在作业场景下强制拒绝（即使管理员从 URL 直接访问）
  - [ ] SubTask 11.3: `lib/solution/permissions.ts` 增加 `isAssignmentContext` 参数

- [x] Task 12: 管理员题解管理入口
  - [ ] SubTask 12.1: `app/admin/problems/[id]/edit/page.tsx` 增加"标程题解"区块
  - [ ] SubTask 12.2: 展示当前题解列表 + 操作按钮（编辑、删除、重新生成）
  - [ ] SubTask 12.3: "查看题目页"按钮跳转

- [x] Task 13: 测试与质量检查
  - [ ] SubTask 13.1: `scripts/test-5-solution-permissions.ts` 单元测试
  - [ ] SubTask 13.2: `npx tsc --noEmit` 通过
  - [ ] SubTask 13.3: `npm run lint` 通过
  - [ ] SubTask 13.4: 手动测试：管理员查看、普通用户达分/未达分、作业场景、AI 标识
  - [ ] SubTask 13.5: 提交 git commit

- [ ] Task 14: UI 修复与 views 去重
  - [x] SubTask 14.1: SolutionCard 移除 absolute 定位，AI 徽章改为 inline 流式
  - [x] SubTask 14.2: Prisma 新增 SolutionView 模型
  - [x] SubTask 14.3: API 实现去重 views：登录 userId / 未登录 IP（FNV-1a 哈希）
  - [x] SubTask 14.4: npx tsc --noEmit 通过
  - [x] SubTask 14.5: 单元测试 12/12 通过

- [x] Task 15: 点赞 toggle 模式 + 去重
  - [x] SubTask 15.1: Prisma 新增 SolutionLike 模型 + `@@unique([solutionId, userId])`
  - [x] SubTask 15.2: POST /api/solutions/[id]/like 改为 toggle 模式（已点赞则 -1，未点赞则 +1）
  - [x] SubTask 15.3: 并发安全：P2002 唯一冲突处理（高并发双击幂等）
  - [x] SubTask 15.4: GET 列表/详情接口增加 `isLiked` 字段
  - [x] SubTask 15.5: 详情页点赞按钮：已点赞态（btn-primary + 填充图标 + "已点赞"）
  - [x] SubTask 15.6: SolutionCard 增加 `isLiked` 视觉提示
  - [x] SubTask 15.7: npx tsc --noEmit 通过

- [x] Task 16: prisma client 未生成时优雅降级
  - [x] SubTask 16.1: 新增 `lib/solution/like-helper.ts`：`getSolutionLikeModel` / `getLikedSolutionIds` / `isSolutionLiked` 三个 helper
  - [x] SubTask 16.2: 新增 `lib/solution/view-helper.ts`：`getSolutionViewModel` / `recordUniqueView` / `fnv1a`
  - [x] SubTask 16.3: 列表/详情/点赞 3 个 API 改用 helper
  - [x] SubTask 16.4: 点赞 API 在 client 不可用时返回 503 + 友好提示
  - [x] SubTask 16.5: 列表/详情 client 不可用时降级为 `isLiked=false`，不影响主流程
  - [x] SubTask 16.6: npx tsc --noEmit 通过
  - [x] SubTask 16.7: 单元测试 12/12 通过


# Task Dependencies

- Task 2 (权限) → Task 3 (API)
- Task 3 (API) → Task 6 (查看页)
- Task 3 (API) + Task 5 (编辑器) → Task 7 (发布/编辑页)
- Task 4 (渲染器) → Task 6、Task 7
- Task 5 (编辑器) 依赖 Task 4 (渲染器)
- Task 8 (AI 模块) → Task 9 (触发)
- Task 9 (触发) → Task 12 (管理入口的重新生成按钮)
- Task 1 (schema) → 全部后续任务
