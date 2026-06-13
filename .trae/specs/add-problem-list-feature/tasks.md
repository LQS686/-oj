# 题单（Problem List）功能 - 实现计划

## 任务依赖概览
```
T1 (schema) → T2 (service) → T3 (API 路由) → T4 (用户端) + T5 (admin 端) + T6 (组件)
                                  ↓
T7 (bug 修复) → T8 (typecheck + 联调)
```

---

## [x] 任务1：扩展 Prisma Schema
- **优先级**：P0
- **依赖于**：无
- **描述**：
  - 修改 `Training` 模型：新增 `authorId` / `author` / `status` / `isRecommended` / `categoryId` / `category` / `tags` / `cover` / `joinCount` / `viewCount`
  - 修改 `TrainingProblem` 模型：新增 `score`（default 100）/ `required`（default true）
  - 新增 `TrainingCategory` 模型：id, name, description, orderIndex, createdAt
  - 新增 `TrainingEnrollment` 模型：trainingId, userId, joinedAt；@@unique([trainingId, userId])
  - `description` 改为 `@db.String` 存 markdown（原 String 即可）
- **验收标准**：
  - AC-1.1：`prisma format` 通过
  - AC-1.2：`prisma validate` 通过
  - AC-1.3：`prisma generate` 成功，类型自动更新
- **测试要求**：
  - `programmatic` TR-1.1：跑 `npx prisma validate` 0 错误
  - `programmatic` TR-1.2：跑 `npx prisma generate` 0 错误
- **注意**：不要破坏已有 Training/TrainingProblem 记录（用默认值兼容）

## [x] 任务2：扩展 Training service
- **优先级**：P0
- **依赖于**：T1
- **描述**：
  - `lib/training/service.ts` 扩展：
    - `listPublicTrainingsAdvanced` 增加 `categoryId` / `keyword` / `difficulty` 过滤；分页字段统一为 `{ items, total, page, pageSize, totalPages }`（去掉 `pagination` 嵌套）
    - 新增 `listCategories()`
    - 新增 `enrollTraining(trainingId, userId)` / `unenrollTraining(trainingId, userId)` / `isEnrolled(trainingId, userId)` / `getUserEnrollments(userId)`
    - 新增 `incrementJoinCount(trainingId, delta)` / `incrementViewCount(trainingId)`
    - `createTrainingWithProblems` 接受 `authorId` / `status` / `isRecommended` / `categoryId` / `tags` / `cover`
    - `updateTrainingProblems` 支持单题 score/required/orderIndex 增量更新
  - `lib/training/types.ts` 新增类型定义
  - 缓存 keys 统一：`training:list:{hash}` / `training:byId:{id}` / `training:enrollment:{userId}:{trainingId}`
- **验收标准**：
  - AC-2.1：所有 service 函数带 TypeScript 类型签名
  - AC-2.2：缓存 key 命名一致
  - AC-2.3：service 函数在用户不存在/training 不存在等边界 case 下返回 `null` 或抛带 message 的 Error
- **测试要求**：
  - `programmatic` TR-2.1：`pnpm typecheck` 0 错误
- **注意**：保持与现有函数签名兼容，旧的 `createTrainingWithProblems` 调用点不要破坏

## [x] 任务3：扩展 / 补全 API 路由
- **优先级**：P0
- **依赖于**：T2
- **描述**：
  - `app/api/trainings/route.ts`：
    - GET：公开，分页 + 筛选，返回 `{ items, total, page, pageSize, totalPages }`（去掉 `pagination` 嵌套），防御性包成 `ok(...)`
    - POST：登录用户可创建（**普通用户强制 isPublic=false + status='draft'**；admin 保留原文）
  - `app/api/trainings/[id]/route.ts`：
    - GET：公开，详情 + 题目列表 + 当前用户进度 + 当前用户是否已加入
    - PUT：仅 admin（仅作者或 super admin）
    - DELETE：仅 admin
  - `app/api/trainings/[id]/problems/route.ts`：
    - PATCH：仅 admin，body 支持 `{ action: 'add' | 'remove' | 'reorder' | 'update' }` 四种操作
  - `app/api/trainings/[id]/join/route.ts`（**新增**）：
    - POST：登录用户，加入
    - DELETE：登录用户，退出
  - `app/api/trainings/[id]/progress/route.ts`：
    - GET：登录用户，进度详情
  - `app/api/training-categories/route.ts`（**新增**）：
    - GET：公开，分类列表
    - POST：仅 admin
  - `app/api/training-categories/[id]/route.ts`（**新增**）：
    - PUT/DELETE：仅 admin
  - `lib/training/service.ts` 中 `listPublicTrainingsAdvanced` 当 userId 存在时，**额外 OR 自身 authorId** 以支持"我的题单"返回用户自己创建的私有草稿
  - 所有路由统一用 `withApi` 包装，`ok(...)` 不要再 `ok({ data })` 双层包装
- **验收标准**：
  - AC-3.1：所有 API 响应格式统一为 `{ success, data, error? }`
  - AC-3.2：路由权限正确：写操作 admin/作者，读操作登录/公开
  - AC-3.3：参数校验（ObjectId 格式、必填字段）
  - AC-3.4：普通用户 POST 创建后，库中 isPublic=false、status='draft'、isRecommended=false
  - AC-3.5：登录用户在 GET 列表接口中能查到自己创建的草稿/私有题单
- **测试要求**：
  - `programmatic` TR-3.1：`pnpm typecheck` 0 错误
  - `human-judgment` TR-3.2：手动 curl 各端点验证响应结构
- **注意**：防御性使用 `Array.isArray` / `try-catch`，不要让一个错误请求让后端崩

## [x] 任务4：用户端页面（列表 + 详情）
- **优先级**：P0
- **依赖于**：T3
- **描述**：
  - `app/training/page.tsx` 重写：
    - 顶部 3 大来源分类卡片（`SourceFilterCards`）：官方题单 / 竞赛考级真题 / 我的题单
    - 客户端关键词过滤：contest（竞赛/考级/CSP/NOIP 等）匹配 `tags + title + category.name`
    - 客户端 mine 过滤：`userProgress.isJoined || author.id === currentUserId`
    - 登录用户右上角"创建题单"按钮（链接 `/training/create`）
    - "我的题单"为空时引导创建第一个题单
    - **防御性**：`Array.isArray(data.data?.items) ? data.data.items : []`
    - **fetch**：`cache: 'no-store'`
    - 主题化颜色
  - `app/training/[id]/page.tsx`（洛谷风格）：
    - 面包屑 + Tab 切换（题单简介/题目列表）
    - 右侧信息侧栏（操作按钮 + 信息卡 + 我的进度）
    - 题单详情：标题、封面、描述（markdown 渲染）、作者、分类、标签
    - 用户进度：百分比进度条 + 已通过/尝试/未做 数量
    - 题目列表：表格布局（题号、题目名称、难度、通过率、状态）
    - 加入按钮（详见 T6 组件）
    - **实时更新**：
      - `useSubmissionSocket` 监听
      - 任何终态事件都更新题目状态（**不**门控 currentSubmissionId）
      - 进度百分比实时重算
      - `useEffect` 兜底：列表里有非终态题目时 3s 轮询
      - fetch 用 `cache: 'no-store'`
- **验收标准**：
  - AC-4.1：列表页在 API 字段错位时**不报错**，降级显示"暂无题单"
  - AC-4.2：详情页用户做题后，状态**实时**反映在题目列表上
  - AC-4.3：进度条在用户 AC 新题后**实时**增长
  - AC-4.4：未登录用户可看题单详情，但"加入"按钮置灰
  - AC-4.5：草稿题单对非作者返回 404
  - AC-4.6：3 大分类切换可正确过滤；未登录用户禁用"我的题单"
- **测试要求**：
  - `programmatic` TR-4.1：`pnpm typecheck` 0 错误
  - `human-judgment` TR-4.2：手动测试：登录、加入、做题、退出
  - `human-judgment` TR-4.3：手动验证实时更新（开两个 tab）
- **注意**：所有 fetch 必须用 `cache: 'no-store'`；WebSocket 处理沿用 `/problem/[id]` 修复的稳健模式

## [x] 任务5：管理后台（题单管理）
- **优先级**：P0
- **依赖于**：T3
- **描述**：
  - `app/admin/trainings/page.tsx`（**新增**）：题单管理列表
    - 表格：标题 / 作者 / 状态 / 分类 / 题数 / 加入人数 / 创建时间 / 操作（编辑/删除）
    - 筛选：状态、分类、关键字
    - 新建按钮 → `/admin/trainings/create`
  - `app/admin/trainings/create/page.tsx`（**新增**）：创建题单
    - 表单：标题、描述（textarea）、分类（下拉）、标签（chip 输入）、封面（可选 URL）、可见性、推荐、初始题目列表（多选 + 排序）
    - 提交后跳转 `/admin/trainings/[id]`
  - `app/admin/trainings/[id]/page.tsx`（**新增**）：编辑题单
    - 基本信息（同上）
    - **题目管理**：
      - 当前题目列表（可拖拽排序，可改分数/必做）
      - 添加题目（搜索/多选）
      - 删除题目
    - 保存/发布/取消发布
  - `app/admin/layout.tsx`（或侧边栏组件）：加"题单管理"链接
- **验收标准**：
  - AC-5.1：管理员可创建题单并立即在前台看到
  - AC-5.2：草稿题单在用户端不可见
  - AC-5.3：题目排序/分数/必做 修改后立即持久化
  - AC-5.4：删除题单有二次确认
- **测试要求**：
  - `programmatic` TR-5.1：`pnpm typecheck` 0 错误
  - `human-judgment` TR-5.2：手动跑：创建 → 编辑 → 添加题目 → 排序 → 删除

## [x] 任务6：组件
- **优先级**：P0
- **依赖于**：T3
- **描述**：
  - `components/training/TrainingCard.tsx`（**新增**）：
    - 卡片展示：标题、描述、题数、加入人数、用户进度、推荐徽章
    - 点击跳详情
  - `components/training/JoinTrainingButton.tsx`（**新增**）：
    - 三个状态：未登录（置灰）/ 未加入（"加入"）/ 已加入（"继续学习" / 长按退出）
    - **解决卡死 bug**：
      - `useRef<joiningIdRef>` 替代闭包陈旧值
      - `isJoining` state 独立，不被任何门控
      - 失败时 `setIsJoining(false)`（catch + finally）
      - `disabled={isJoining}` 防双击
  - `components/training/ProblemListItem.tsx`（**新增**）：
    - 题目行：编号、标题、难度、状态徽章
    - 状态：未做 / 尝试中（带 spinner）/ 已通过 / 未通过
  - `components/training/CategoryFilter.tsx`（**新增**）：
    - 横向滚动的分类 Tab
  - `components/training/RecommendedTrainingBanner.tsx`（**新增**）：
    - 列表页顶部推荐位（最多 3 个）
- **验收标准**：
  - AC-6.1：所有组件 props 类型完整
  - AC-6.2：颜色全部主题化
  - AC-6.3：组件有 fallback 状态（loading / empty / error）
- **测试要求**：
  - `programmatic` TR-6.1：`pnpm typecheck` 0 错误
  - `human-judgment` TR-6.2：手动验证各状态

## [x] 任务7：bug 修复与防御性
- **优先级**：P0
- **依赖于**：T4
- **描述**：
  - 沿用 `/problem/[id]` 修复模式，检查所有新页面：
    - 列表页：API 响应字段错位时降级为 `[]`，不抛 TypeError
    - 详情页：WebSocket 处理不门控 currentSubmissionId；用 useRef；useEffect 兜底轮询
    - JoinButton：isJoining 用 useRef 兜底；catch 中重置；防双击
  - 老 `app/training/page.tsx` 的进度显示（`userProgress?.solvedCount`）必须从 API 实时拉，不能只读 mount 时一次
- **验收标准**：
  - AC-7.1：所有 fetch 用 `cache: 'no-store'`
  - AC-7.2：WebSocket 处理遵循稳健模式（useRef + 解耦 + useEffect 兜底）
  - AC-7.3：API 响应异常时前端**不崩**，降级为空状态
- **测试要求**：
  - `programmatic` TR-7.1：grep 验证无 `pagination` 字段残留
  - `programmatic` TR-7.2：grep 验证无 `if (data.id === currentSubmissionId) {` 门控模式（仅进度条中间状态保留）
  - `human-judgment` TR-7.3：手动验证 API 异常响应下的前端行为

## [x] 任务8：联调与验证
- **优先级**：P1
- **依赖于**：T1-T7
- **描述**：
  - 跑 `pnpm typecheck` 0 错误
  - 跑 `pnpm lint` 0 新错误
  - 手动跑全流程：admin 创建题单 → 用户端浏览 → 用户加入 → 用户做题 → 进度实时更新 → 退出
  - 检查响应时间（列表 < 500ms，详情 < 800ms）
- **验收标准**：
  - AC-8.1：typecheck + lint 0 错误
  - AC-8.2：全流程跑通
- **测试要求**：
  - `programmatic` TR-8.1：`pnpm typecheck && pnpm lint`
  - `human-judgment` TR-8.2：全流程跑通

---

## [x] 任务9：UI 升级为洛谷风格 + 3 大来源分类
- **优先级**：P1
- **依赖于**：T4 + T6
- **描述**：参考洛谷题单页面，合理迁移；并按用户要求保留 3 大来源分类
  - 卡片网格：编号+标题+作者+收藏+进度环
  - 详情页：面包屑 + Tab 切换（题单简介/题目列表）+ 右侧信息侧栏
  - 题目列表：表格布局（题号、题目名称、难度、通过率、状态）
  - 进度环组件：SVG 圆形进度
  - **3 大来源分类**（`SourceFilterCards`，按用户反馈保留）：
    - **官方题单**（官方题单图标）：`isRecommended=true` 的公开题单
    - **竞赛/考级真题**（奖杯图标）：客户端关键词过滤（`竞赛` / `考级` / `真题` / `CSP` / `NOIP` / `NOI` / `ICPC` / `GESP` / `省选`）匹配 `tags + title + category.name`
    - **我的题单**（用户图标）：已加入 OR 自己创建；未登录时禁用
  - **不筛选**：无分类 Tab、无难度筛选、无关键字搜索（用户要求简化）
  - **用户可创建题单**：登录用户右上角"创建题单"按钮 → `/training/create`
  - **空态优化**："我的题单"为空时引导创建第一个题单
- **变更文件**：
  - `components/training/ProgressCircle.tsx`（**新增**）：SVG 圆形进度环
  - `components/training/SourceFilterCards.tsx`（**新增**）：3 大来源分类卡片（替换早期 4 卡片版本）
  - `components/training/TrainingCard.tsx`（**重写**）：洛谷风格卡片
  - `app/training/page.tsx`（**重写**）：3 大分类 + 卡片网格
  - `app/training/[id]/page.tsx`（**重写**）：面包屑 + Tab + 侧栏 + 题目表格
  - `hooks/useSubmissionSocket.ts`：SubmissionUpdate 加 `problemId` 字段
  - `lib/websocket/server.ts`：`emitSubmissionUpdate` 签名加 `problemId`
  - `lib/judge/worker.ts`：推送时附带 `submission.problemId`
  - `lib/training/service.ts`：
    - `getTrainingWithProblemStatuses` / `getTrainingProblems` select 增 `problemNumber`
    - `listPublicTrainingsAdvanced` 在 userId 存在时，OR 自身 authorId 以返回用户私有题单
- **验收标准**：
  - AC-9.1：列表页有 3 大来源分类卡片，可正确切换过滤
  - AC-9.2：列表卡片显示编号、作者、收藏数、进度环
  - AC-9.3：详情页有面包屑和 Tab 切换
  - AC-9.4：详情页右侧有操作按钮和信息侧栏
  - AC-9.5：题目列表为表格布局，包含通过率列
  - AC-9.6：未登录用户禁用"我的题单"分类
  - AC-9.7：登录用户可看到自己创建的私有/草稿题单（在"我的题单"分类中）
- **测试要求**：
  - `programmatic` TR-9.1：`pnpm typecheck` 0 错误
  - `human-judgment` TR-9.2：登录用户切换 3 大分类，看到对应题单

---

## [x] 任务10：用户端创建题单页面
- **优先级**：P1
- **依赖于**：T3 + T9
- **描述**：
  - `app/training/create/page.tsx`（**新增**）：用户端创建题单
  - 顶部提示：题单默认是"私有草稿"，仅自己可见；如需发布请联系管理员
  - **v1 原始设计（已被 T11 调整覆盖）**：表单包含标题 / 描述 / 难度（5 档） / 分类（下拉） / 标签 / 封面 / 题目选择
  - **v2 当前设计**（按 T11 调整）：
    - 表单只保留：标题 / 描述（textarea） / 标签（chip） / 封面 URL（可选） / 题目选择（多选 + 排序）
    - **移除难度字段**
    - **隐藏分类选项**（后端自动置 categoryType=null）
  - **不暴露** `isPublic` / `status` / `isRecommended` / `categoryType` 字段（后端自动强制为私有草稿）
  - 未登录用户访问时跳登录页（`?redirect=/training/create`）
  - 提交后跳 `/training/{id}`（非 admin）
  - 提示：标签中包含 `CSP` / `NOIP` / `竞赛` / `考级` / `真题` 等有助于归入"竞赛/考级真题"分类
  - 防御性：`Array.isArray` 降级 / `cache: 'no-store'` / try-catch
- **变更文件**：
  - `app/training/create/page.tsx`（**新增**）
- **验收标准**：
  - AC-10.1：未登录用户访问跳登录页
  - AC-10.2：表单缺标题/描述时 toast 报错（v2 移除难度必填）
  - AC-10.3：提交成功后跳到 `/training/{id}`，可见私有草稿题单详情
  - AC-10.4：数据库中 isPublic=false、status='draft'、isRecommended=false、categoryType=null
  - AC-10.5：切换到"我的题单"分类时可看到自己刚创建的题单
  - AC-10.6：**（v2 新增）** 表单**不展示**难度、**不展示**分类选项
- **测试要求**：
  - `programmatic` TR-10.1：`pnpm typecheck` 0 错误
  - `human-judgment` TR-10.2：手动跑：登录 → 创建 → 跳详情 → 列表中可见

---

## [x] 任务11：移除难度字段 + 分类二选一（仅 admin 可选）
- **优先级**：P1
- **依赖于**：T1-T10
- **背景**：用户反馈题单不需要难度字段；分类只保留"官方/竞赛"两档，且仅后台管理入口可选择
- **描述**：
  - **Schema 变更**（[prisma/schema.prisma](file:///e:/桌面/oj/prisma/schema.prisma)）：
    - `Training.difficulty: String` → `String?`（保留兼容老数据，不再作为业务字段）
    - 新增 `Training.categoryType: String?`（'official' | 'contest'） + `@@index([categoryType])`
  - **类型同步**（[lib/training/types.ts](file:///e:/桌面/oj/lib/training/types.ts)）：
    - 新增 `TrainingCategoryType = 'official' | 'contest'`
    - 所有 Training 接口的 `difficulty: string` → `string | null`
    - 新增 `categoryType: TrainingCategoryType | null`
  - **Service 同步**（[lib/training/service.ts](file:///e:/桌面/oj/lib/training/service.ts)）：
    - `createTrainingWithProblems` / `updateTrainingAndProblems` 接受 `categoryType`
    - `listPublicTrainingsAdvanced` / `getTrainingWithProblemStatuses` 返回中加 `categoryType`
  - **API 同步**：
    - [app/api/trainings/route.ts](file:///e:/桌面/oj/app/api/trainings/route.ts)：
      - POST 移除 `difficulty` 必填校验
      - POST 限制 `categoryType` 仅 admin 可设置
      - GET 新增 `categoryType` query 参数过滤
    - [app/api/trainings/[id]/route.ts](file:///e:/桌面/oj/app/api/trainings/[id]/route.ts)：
      - PUT body 新增 `categoryType`
      - 非 admin 用户请求时自动剥离 `categoryType/isRecommended/status/isPublic` 字段
  - **前端 4 个页面改造**：
    - [app/admin/trainings/create/page.tsx](file:///e:/桌面/oj/app/admin/trainings/create/page.tsx)：
      - 移除难度下拉 + 分类下拉
      - 改为 `categoryType` radio 二选一（官方 / 竞赛）
    - [app/admin/trainings/[id]/page.tsx](file:///e:/桌面/oj/app/admin/trainings/[id]/page.tsx)：
      - 同上，编辑页用 radio
    - [app/training/create/page.tsx](file:///e:/桌面/oj/app/training/create/page.tsx)：
      - **用户端**：移除难度 + 分类 UI（完全隐藏）
      - 提交时不传 `categoryType` / `difficulty`
    - [app/training/page.tsx](file:///e:/桌面/oj/app/training/page.tsx)：
      - 列表过滤逻辑改用 `categoryType` 字段（兼容老的 `isRecommended` 兜底）
    - [app/training/[id]/page.tsx](file:///e:/桌面/oj/app/training/[id]/page.tsx)：
      - `difficultyTag` 函数改为接受 `string | null | undefined`，null 时不显示
      - 详情页"难度"行在 difficulty 为空时整行不渲染
  - **类型修复**（[components/training/TrainingCard.tsx](file:///e:/桌面/oj/components/training/TrainingCard.tsx)）：
    - `TrainingCardData.difficulty: string` → `string | null`（可选）
- **验收标准**：
  - AC-11.1：`pnpm typecheck` 0 错误
  - AC-11.2：admin 端创建/编辑题单：分类用 radio 二选一（官方/竞赛），无难度字段
  - AC-11.3：用户端 `/training/create`：**完全不展示**难度、**完全不展示**分类选项
  - AC-11.4：后端 API：非 admin 调用 POST/PUT 时 `categoryType` 字段被忽略
  - AC-11.5：数据库中老题单（带 difficulty）的详情页能正常显示（兼容）
  - AC-11.6：列表页"官方题单"分类只显示 `categoryType='official'` 或 `isRecommended=true` 的题单
  - AC-11.7：列表页"竞赛真题"分类只显示 `categoryType='contest'` 或 tag/title 含竞赛关键词的题单
- **测试要求**：
  - `programmatic` TR-11.1：`npx tsc --noEmit` 0 错误
  - `human-judgment` TR-11.2：手动测试 admin 创建官方题单 / 竞赛题单
  - `human-judgment` TR-11.3：手动测试用户端创建：表单无难度无分类
  - `human-judgment` TR-11.4：手动测试列表页 3 大分类过滤准确性
- **注意**：
  - `prisma generate` 报 EBUSY 是 dev server 占用二进制，类型文件已更新；运行时重启 dev server 即可生效
  - 老数据中带 difficulty 字段的题单仍能正常显示与编辑；前端在 difficulty 为空时不显示"难度"行
  - 分类字段 `categoryId` 仍保留在 schema 中（向后兼容），但前端不再使用

---

## Task Dependencies
- T1 (schema) → T2 (service) → T3 (API) → T4 (用户端) + T5 (admin) + T6 (组件) + T10 (用户端创建)
- T4 + T5 + T6 → T7 (bug 修复) → T8 (联调) → T9 (UI 升级 + 3 大分类) → T11 (移除难度 + 分类二选一)
