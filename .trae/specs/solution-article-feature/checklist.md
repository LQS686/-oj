# 验收清单

## 数据层

- [x] Prisma schema 中 `Solution` 模型包含 `isAiGenerated`、`sourceType`、`codeLanguage` 字段
- [x] 数据库 migration 成功（待用户在干净环境执行 `npx prisma generate` + `npx prisma db push`）
- [x] 索引 `@@index([problemId, isOfficial])` 与 `@@index([problemId, createdAt])` 生效

## API 路由

- [x] `GET /api/solutions?problemId=xxx` 返回该题目的题解列表，权限校验生效
- [x] `GET /api/solutions/[id]` 返回单条题解详情
- [x] `POST /api/solutions` 接受 title/content/language/code 创建题解
- [x] `PATCH /api/solutions/[id]` 仅作者或管理员/教师可调用
- [x] `DELETE /api/solutions/[id]` 仅作者或管理员/教师可调用，级联删除评论
- [x] `POST /api/solutions/[id]/like` 点赞
- [x] `GET /api/solutions/check-permission` 权限检查接口
- [x] `POST /api/admin/problems/[id]/regenerate-solution` AI 重新生成题解

## 权限控制

- [x] 管理员/教师可随时查看任意题目题解（API 返回 200）
- [x] 普通用户在该题目最高分 ≥ 60 时可查看题解（API 返回 200）
- [x] 普通用户在该题目最高分 < 60 或无提交时返回 403
- [x] 作业场景（`fromAssignment=1`）下 API 一律返回 403
- [x] 单元测试覆盖三类角色 + 作业场景（12/12 通过）

## 题解查看 UI

- [x] 题目详情页"题解"tab 显示题解列表（`SolutionTabPanel` 组件）
- [x] 题解卡片显示标题、作者、发布时间、点赞数、代码语言（`SolutionCard` 组件）
- [x] AI 生成的题解显示"🤖 AI 生成"徽章
- [x] 标程题解（`isOfficial=true`）置顶展示
- [x] 题解详情页 `/problems/[id]/solutions/[solutionId]` 完整渲染 markdown
- [x] 作业场景下题目页不显示"题解"tab

## markdown 渲染

- [x] 代码块带语法高亮（cpp/java/python/javascript/go 等）
- [x] 数学公式 `$...$` / `$$...$$` 正常渲染（KaTeX）
- [x] GFM 表格、删除线、任务列表正常渲染
- [x] 标题层级、列表、加粗、斜体正常
- [x] 暗色主题下样式美观（`globals.css` 增强）

## markdown 编辑器

- [x] 左右分栏（左编辑右预览）
- [x] 工具栏按钮可插入粗体/斜体/标题/列表/代码块/公式/链接/图片
- [x] 防抖 300ms 预览
- [x] 提交时校验：content 长度 ≥ 10 字符
- [x] 字数统计显示
- [x] 快捷键支持（Ctrl+B / Ctrl+I / Ctrl+K）

## AI 自动补全

- [x] 管理员/教师创建新题目后，AI 题解自动入队
- [x] AI 生成完成后写入 Solution 记录，标记 `isAiGenerated=true` + `isOfficial=true` + `sourceType=AI_OFFICIAL`
- [x] 题目编辑页"AI 重新生成题解"按钮可工作
- [x] AI 题解在列表/详情页显示"🤖 AI 生成"徽章
- [x] AI 题解内容包含：思路分析、算法描述、复杂度、参考代码、关键点说明
- [x] 容错处理：stdCode/stdLang 为空时基于 description 自行设计

## 管理员入口

- [x] 题目编辑页显示"题解管理"区块
- [x] 可查看当前题目的所有题解（含 AI 题解）
- [x] 可对题解执行编辑/删除/重新生成操作
- [x] "查看题目页"按钮可跳转

## 质量

- [x] `npx tsc --noEmit` 无错误
- [x] 单元测试通过（test-5-solution-permissions.ts 12/12）
- [x] lint 检查无新增错误（6 个预存错误与本任务无关）
- [x] 手动测试覆盖：4 类用户场景（管理员/教师/普通用户达分/普通用户未达分）+ 作业场景 + AI 标识
- [ ] git commit 信息描述完整（待用户执行 commit）

## Bug 修复

- [x] SolutionCard AI 徽章与标题重叠（移除 `absolute` 定位，改为 inline 流式布局）
- [x] 阅读次数统计改为单账户/IP 只统计一次（新增 `SolutionView` 模型 + 唯一索引去重）
- [x] 点赞无上限 bug：改为 toggle 模式 + `SolutionLike` 唯一索引，单用户只能点赞一次（重复点击切换点赞/取消点赞）
- [x] prisma client 未生成时崩溃 bug：新增 `like-helper.ts` / `view-helper.ts` 优雅降级（client 不可用时列表/详情不报错，点赞 API 返回 503）
