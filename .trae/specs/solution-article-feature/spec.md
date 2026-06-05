# 题解功能完善 Spec

## Why

OJ 平台当前的 `Solution` Prisma 模型已存在，但**没有对应的前端页面、API 路由、权限控制与编辑器**，用户在题目页面无法查看、发布或编辑题解，管理员也无法维护标程题解。这直接影响"做题-看题解-学习"的核心闭环。

## What Changes

- **新增** 题解 CRUD API（列表、详情、创建、编辑、删除、点赞）
- **新增** 题解 markdown 渲染组件（标题、段落、列表、代码块高亮、KaTeX 数学公式）
- **新增** 题解 markdown 编辑器（`textarea` 实时预览，支持工具栏）
- **新增** 题解查看页 `/problems/[id]/solutions/[solutionId]`
- **新增** 题解发布/编辑页 `/problems/[id]/solutions/new`、`/problems/[id]/solutions/[solutionId]/edit`
- **新增** AI 补全标程题解能力（异步触发，AI 生成需标注 `isAiGenerated=true`）
- **新增** 题解查看权限控制：
  - 管理员/教师：随时可查看所有题解
  - 普通用户：需在本题目获得过 ≥ 60 分（基于 `Submission.score` 的最高分）才能查看
- **新增** 题目创建时自动触发 AI 补全标程题解（后台异步，不阻塞创建）
- **新增** Prisma schema 扩展：`Solution.isAiGenerated`、`Solution.codeLanguage`、`Solution.sourceType`（OFFICIAL/USER/AI_OFFICIAL）
- **新增** 作业场景下隐藏题解入口：当 URL 含 `fromAssignment=1` 时，问题页不显示「题解」tab
- **修改** 题目详情页 `app/problem/[id]/page.tsx` 接入新的题解模块
- **修改** 管理员题解管理入口：在 `app/admin/problems/[id]/edit/page.tsx` 增加"标程题解"区块

## Impact

- **Affected specs**:
  - `concurrent-single-problem-generation`（题解异步生成与 AI 出题并发机制一致）
  - `remove-verification-status-and-manual-review`（题解模型已删除 `verified` 字段，复用此精简模型）
- **Affected code**:
  - `prisma/schema.prisma`（扩展 Solution）
  - `app/problem/[id]/page.tsx`（tab 接入 + 权限判断）
  - `app/api/solutions/**`（新增）
  - `app/problems/[id]/solutions/**`（新增）
  - `components/solution/**`（新增）
  - `lib/ai/solution-generator.ts`（新增：基于题目描述 + stdCode 生成题解）
  - `lib/ai/queue.ts`（复用，AI 题解入队列）
  - `app/api/admin/problems/route.ts`（题目创建后入队）
  - `app/admin/problems/[id]/edit/page.tsx`（增加题解区块）

## ADDED Requirements

### Requirement: 题解发布与编辑
系统 SHALL 提供题解的完整 CRUD 能力。

#### Scenario: 用户发布题解
- **WHEN** 已登录用户对某题目发布新题解（提交 `title`、`content` markdown、可选 `language`+`code`）
- **THEN** 系统创建 `Solution` 记录，`authorId` 为当前用户
- **AND** 题解默认 `isOfficial=false`、`isAiGenerated=false`、`sourceType=USER`

#### Scenario: 作者编辑题解
- **WHEN** 用户编辑自己发布的题解
- **THEN** 系统更新 `content`/`title`/`code`/`language` 与 `updatedAt`

#### Scenario: 删除题解
- **WHEN** 作者本人或管理员/教师删除题解
- **THEN** 系统从数据库删除该 `Solution` 及关联 `Comment`

### Requirement: 题解查看与权限控制
系统 SHALL 根据用户身份与成绩控制题解可访问性。

#### Scenario: 管理员/教师随时查看
- **WHEN** 用户角色为 ADMIN 或 TEACHER
- **THEN** 任意题目的题解列表/详情均直接返回 200

#### Scenario: 普通用户达分查看
- **WHEN** 普通用户在某题目的最高得分 `>= 60`（基于 `Submission.score`）
- **THEN** 该题目题解列表/详情返回 200

#### Scenario: 普通用户未达分
- **WHEN** 普通用户在该题目的最高得分 `< 60` 或无提交
- **THEN** 题解 API 返回 403，前端隐藏题解 tab/入口

#### Scenario: 作业场景隐藏
- **WHEN** 题目页面 URL 含 `?fromAssignment=1`（含 `teamId`+`assignmentId`）
- **THEN** 题解 tab/入口完全不渲染，API 一并返回 403

### Requirement: 题解 markdown 渲染
系统 SHALL 使用 `react-markdown` + `remark-gfm` + `remark-math` + `rehype-katex` + `react-syntax-highlighter` 渲染题解内容。

#### Scenario: 渲染代码块
- **WHEN** 题解内容包含 ```` ```cpp ... ``` ```` 代码块
- **THEN** 渲染为带语法高亮的代码区域，显示语言标签

#### Scenario: 渲染数学公式
- **WHEN** 题解内容包含 `$E=mc^2$` 或 `$$\sum_{i=1}^n i$$`
- **THEN** 渲染为 KaTeX 公式

#### Scenario: 渲染标题/列表/表格
- **WHEN** 题解内容含 `# 标题`、`- 列表项`、`| 表格 |`
- **THEN** 分别渲染为 `<h1>`、`<ul>`、`<table>`

### Requirement: 题解 markdown 编辑器
系统 SHALL 提供实时预览的题解编辑器。

#### Scenario: 实时预览
- **WHEN** 用户在左侧 `textarea` 输入 markdown
- **THEN** 右侧实时渲染预览（防抖 300ms）

#### Scenario: 工具栏
- **WHEN** 用户点击工具栏按钮（粗体/斜体/标题/代码块/公式/链接/图片）
- **THEN** 在光标位置插入对应 markdown 语法

#### Scenario: 提交校验
- **WHEN** 用户提交时 `content` 为空或长度 < 10 字符
- **THEN** 前端校验失败，不发送请求

### Requirement: AI 自动补全标程题解
系统 SHALL 在题目创建后自动触发 AI 生成标程题解。

#### Scenario: 题目创建触发
- **WHEN** 管理员/教师创建新题目（提交包含 `title`/`description`/`stdCode`/`stdLang`）
- **THEN** 题目创建成功后立即入队 AI 题解生成任务，不阻塞响应
- **AND** 生成完成后写入 `Solution` 记录，`isAiGenerated=true`、`isOfficial=true`、`sourceType=AI_OFFICIAL`、`title="AI 标程题解 - {题目标题}"`

#### Scenario: 手动重生成
- **WHEN** 管理员在题目编辑页点击"AI 重新生成题解"
- **THEN** 删除原 AI 标程题解并重新入队生成

#### Scenario: AI 标识展示
- **WHEN** 题解列表/详情中包含 `isAiGenerated=true` 的题解
- **THEN** 在题解卡片顶部展示"🤖 AI 生成"徽章

### Requirement: 用户题解列表与详情
系统 SHALL 在题目详情页提供题解浏览入口。

#### Scenario: 题解列表 tab
- **WHEN** 用户点击题目详情页"题解"tab
- **THEN** 展示该题目的题解列表（按 `isOfficial` 置顶 + `createdAt` 倒序）
- **AND** 每条显示标题、作者、发布时间、点赞数、代码语言

#### Scenario: 题解详情
- **WHEN** 用户点击某条题解
- **THEN** 跳转到 `/problems/[id]/solutions/[solutionId]`，渲染完整 markdown
- **AND** 显示作者信息、发布时间、点赞按钮、代码块（可单独展示）

## MODIFIED Requirements

### Requirement: 题目详情页 tab 结构
**原行为**: 已有 `description | submit | solutions | submissions` 4 个 tab
**新行为**: 复用现有 tab 结构，solutions tab 接入新的题解列表/查看组件；当 `fromAssignment=1` 时不显示 solutions tab

## REMOVED Requirements

无（保留向后兼容，原有 Solution 模型字段 `views`/`likes` 继续使用）
