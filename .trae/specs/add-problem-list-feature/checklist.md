# 题单（Problem List）功能 - 验收清单

## Schema (任务1)
- [x] `Training` 模型新增字段：`authorId` / `author` / `status` / `isRecommended` / `categoryId` / `category` / `tags` / `cover` / `joinCount` / `viewCount`
- [x] `TrainingProblem` 模型新增字段：`score`（default 100）/ `required`（default true）+ `@@unique([trainingId, problemId])`
- [x] `TrainingCategory` 模型：id, name, description, orderIndex, createdAt
- [x] `TrainingEnrollment` 模型：trainingId, userId, joinedAt；@@unique([trainingId, userId])
- [x] `npx prisma validate` 通过
- [x] `npx prisma generate` 通过（dev server 占用二进制，类型已更新；运行时重启即可生效）
- [x] 现有 Training 记录不被破坏（schema 演进兼容，新增字段均有默认值）

## Service (任务2)
- [x] `lib/training/service.ts` 扩展完成
- [x] `listPublicTrainingsAdvanced` 返回统一字段 `{ items, total, page, pageSize, totalPages }`（去掉 `pagination` 嵌套）
- [x] 新增 `listCategories()` / `createCategory()` / `updateCategory()` / `deleteCategory()`
- [x] 新增 `enrollTraining()` / `unenrollTraining()` / `isEnrolled()` / `getUserEnrollments()`
- [x] 新增 `incrementJoinCount()` / `incrementViewCount()`
- [x] 新增 `listRecommendedTrainings()` / `createTrainingWithProblems()` / `updateTrainingAndProblems()`
- [x] 新增 `addTrainingProblems()` / `removeTrainingProblems()` / `reorderTrainingProblems()` / `updateTrainingProblemItem()`
- [x] 新增 `getTrainingWithProblemStatuses()` / `getTrainingProblems()` / `getUserTrainingProgressDetail()`
- [x] 新增 `lib/training/types.ts` 类型模块（统一导出）
- [x] 缓存 keys 统一命名（`training:list:` / `training:byId:` / `training:enrollment:` / `training:categories:` 等）
- [x] 所有 service 函数有 TypeScript 类型签名
- [x] `pnpm typecheck` 0 错误

## API 路由 (任务3)
- [x] `GET /api/trainings` 公开，分页 + 筛选，响应统一格式
- [x] `POST /api/trainings` 登录用户可创建（**普通用户强制 isPublic=false + status='draft'**；admin 可自定义）
- [x] `GET /api/trainings/[id]` 公开，详情 + 题目列表 + 用户进度
- [x] `PUT /api/trainings/[id]` 仅 admin/作者
- [x] `DELETE /api/trainings/[id]` 仅 admin/作者
- [x] `PATCH /api/trainings/[id]/problems` 仅 admin/作者，4 种 action（add/remove/reorder/update）
- [x] `POST /api/trainings/[id]/join` 登录用户加入
- [x] `DELETE /api/trainings/[id]/join` 登录用户退出
- [x] `GET /api/trainings/[id]/progress` 登录用户进度（已存在，沿用）
- [x] `GET /api/trainings/recommended` 公开，推荐位数据
- [x] `GET /api/training-categories` 公开
- [x] `POST /api/training-categories` 仅 admin
- [x] `PUT /api/training-categories/[id]` 仅 admin
- [x] `DELETE /api/training-categories/[id]` 仅 admin（有引用时拒绝）
- [x] `GET /api/admin/trainings` 鉴权管理端：含草稿
- [x] 所有 API 响应统一为 `{ success, data, error? }`（不再 `data: { data: ... }` 双层包装）
- [x] 参数校验（ObjectId 格式、必填字段、isObjectId）
- [x] `listPublicTrainingsAdvanced` 登录用户时 OR `authorId` 自身，可见私有/草稿题单
- [x] `pnpm typecheck` 0 错误

## 用户端页面 (任务4)
- [x] `app/training/page.tsx` 重写：3 大来源分类 + 客户端过滤 + 卡片
- [x] `app/training/page.tsx` 防御性：`Array.isArray()` 降级为 `[]`
- [x] `app/training/page.tsx` fetch 用 `cache: 'no-store'`
- [x] `app/training/page.tsx` 主题化颜色（`text-foreground` 等）
- [x] `app/training/page.tsx` 登录用户右上角"创建题单"按钮
- [x] `app/training/[id]/page.tsx` 新增：详情 + 进度 + 题目列表
- [x] `app/training/[id]/page.tsx` 实时更新（WebSocket + 3s 轮询兜底）
- [x] `app/training/[id]/page.tsx` 404 友好处理
- [x] 未登录用户可看但"加入"置灰（跳登录）
- [x] 草稿题单对非作者 404
- [x] 3 大分类切换：官方 / 竞赛真题 / 我的
- [x] "我的题单"分类：未登录时禁用；登录时按 isJoined || author.id === currentUserId 过滤
- [x] `pnpm typecheck` 0 错误

## 管理后台 (任务5)
- [x] `app/admin/trainings/page.tsx` 新增：题单管理列表
- [x] `app/admin/trainings/page.tsx` 筛选：状态、关键字
- [x] `app/admin/trainings/categories/page.tsx` 新增：分类管理（增删改）
- [x] `app/admin/trainings/create/page.tsx` 新增：创建题单
- [x] `app/admin/trainings/create/page.tsx` **（T11 调整后）** 移除难度字段；分类用 radio 二选一（官方/竞赛）
- [x] `app/admin/trainings/[id]/page.tsx` 新增：编辑题单 + 题目管理
- [x] `app/admin/trainings/[id]/page.tsx` **（T11 调整后）** 编辑页同样移除难度、分类用 radio
- [x] `app/admin/trainings/[id]/page.tsx` 题目管理：上移/下移排序 + 分数 + 必做
- [x] `app/admin/trainings/[id]/page.tsx` 添加题目（搜索/多选）
- [x] `app/admin/layout.tsx` 加"题单管理"链接
- [x] 草稿题单用户端不可见（API 过滤 + UI 不显示）
- [x] 删除有二次确认（`confirm()`）
- [x] `pnpm typecheck` 0 错误

## 组件 (任务6)
- [x] `components/training/TrainingCard.tsx` 新增
- [x] `components/training/JoinTrainingButton.tsx` 新增（解决卡死 bug）
- [x] `components/training/ProblemListItem.tsx` 新增
- [x] `components/training/CategoryFilter.tsx` 新增
- [x] `components/training/RecommendedTrainingBanner.tsx` 新增
- [x] JoinButton 用 useRef + 防双击 + 失败重置
- [x] 所有组件 props 类型完整（TS 校验通过）
- [x] 颜色全部主题化（`text-foreground` / `text-muted-foreground` / `text-primary-light` 等）
- [x] 组件有 fallback 状态（loading / empty / error）
- [x] `pnpm typecheck` 0 错误

## Bug 修复 (任务7)
- [x] 所有 fetch 用 `cache: 'no-store'`
- [x] WebSocket 处理遵循稳健模式（useRef + 解耦 + useEffect 兜底 + 3s 轮询）
- [x] API 响应异常时前端不崩（`Array.isArray` / try-catch / fallback）
- [x] 列表不残留 `pagination` 字段
- [x] 无 `if (data.id === currentSubmissionId) { ... }` 门控模式

## UI 升级 (任务9) - 洛谷风格迁移 + 3 大来源分类
- [x] 列表页有 3 大来源分类卡片（官方 / 竞赛真题 / 我的）
- [x] 官方题单：**（T11 调整后）** 过滤 `categoryType='official'` 或 `isRecommended=true`（兼容老数据）
- [x] 竞赛/考级真题：**（T11 调整后）** 过滤 `categoryType='contest'` 或客户端关键词（`竞赛` / `考级` / `真题` / `CSP` / `NOIP` / `NOI` / `ICPC` / `GESP` / `省选`）匹配 `tags + title`
- [x] 我的题单：未登录禁用；登录时按 `isJoined || author.id === currentUserId` 过滤
- [x] 卡片显示：编号 (#N) + 标题 + 作者头像 + 收藏数 + 进度环
- [x] 进度环组件（SVG 圆形）
- [x] 详情页：面包屑（题单广场 / 标题）
- [x] 详情页：Tab 切换（题单简介 / 题目列表）
- [x] 详情页：右上角题数 + 收藏人数
- [x] 详情页：右侧侧栏（操作按钮 + 信息卡 + 我的进度）
- [x] 题目表格：题号、题目名称、难度、通过率、状态
- [x] 通过率进度条（< 30% 红、30-60% 黄、>= 60% 绿）
- [x] 收藏数格式化（36135 -> 36.13k）
- [x] WebSocket 推送新增 problemId 字段
- [x] `pnpm typecheck` 0 错误

## 用户端创建 (任务10)
- [x] `app/training/create/page.tsx` 新增：用户端创建题单
- [x] 顶部提示：题单默认"私有草稿"，仅自己可见
- [x] **（T11 调整后）** **不展示**难度字段
- [x] **（T11 调整后）** **不展示**分类选项（仅 admin 端可设置 categoryType）
- [x] 不暴露 `isPublic` / `status` / `isRecommended` / `categoryType` 字段（后端强制）
- [x] 未登录用户访问跳登录页（`?redirect=/training/create`）
- [x] **（T11 调整后）** 表单校验只检查标题/描述（移除难度必填）
- [x] 标签提示：包含 `CSP` / `NOIP` / `竞赛` 等有助于归入"竞赛真题"分类
- [x] 提交后跳 `/training/{id}`
- [x] 数据库中 `isPublic=false` / `status='draft'` / `isRecommended=false` / `categoryType=null`
- [x] 切换"我的题单"分类可见自己创建的题单
- [x] `pnpm typecheck` 0 错误

## 调整 (任务11) - 移除难度 + 分类二选一（仅 admin 可选）
- [x] `Training.difficulty` 字段类型改为 `String?`（保留兼容老数据）
- [x] `Training` 模型新增 `categoryType: String?` 字段 + `@@index([categoryType])`
- [x] `lib/training/types.ts` 新增 `TrainingCategoryType = 'official' | 'contest'`
- [x] 所有 Training 接口的 `difficulty` 改为 `string | null`
- [x] 所有 Training 接口新增 `categoryType: TrainingCategoryType | null`
- [x] `lib/training/service.ts` create / update / list / get 全部支持 categoryType
- [x] `app/api/trainings` POST 移除 difficulty 必填校验
- [x] `app/api/trainings` POST 限制 categoryType 仅 admin 可设置
- [x] `app/api/trainings` GET 新增 categoryType query 参数过滤
- [x] `app/api/trainings/[id]` PUT body 支持 categoryType
- [x] `app/api/trainings/[id]` PUT 非 admin 自动剥离 categoryType/isRecommended/status/isPublic
- [x] `app/admin/trainings/create/page.tsx` 移除难度 + 分类下拉
- [x] `app/admin/trainings/create/page.tsx` 分类改为 radio 二选一（官方/竞赛）
- [x] `app/admin/trainings/[id]/page.tsx` 同样改造为 radio
- [x] `app/training/create/page.tsx`（用户端）**完全移除**难度 + 分类 UI
- [x] `app/training/page.tsx` 列表过滤改用 categoryType 字段
- [x] `app/training/[id]/page.tsx` `difficultyTag` 函数接受 `string | null | undefined`，null 时不显示
- [x] `app/training/[id]/page.tsx` 详情页"难度"行在 difficulty 为空时整行不渲染
- [x] `components/training/TrainingCard.tsx` difficulty 类型改为可选 `string | null`
- [x] 老题单（带 difficulty 数据）详情页能正常显示（兼容）
- [x] `npx tsc --noEmit` 0 错误

## 联调验证 (任务8)
- [x] `pnpm typecheck` 0 错误
- [ ] `pnpm lint` 0 新错误（建议手动跑）
- [ ] 全流程跑通：admin 创建题单 → 用户端浏览 → 用户加入 → 用户做题 → 进度实时更新 → 退出
- [ ] 用户创建题单流程：登录 → /training/create → 填写 → 提交 → 跳详情 → 我的题单中可见
- [x] 草稿题单用户端不可见
- [x] 草稿题单非作者 404
- [x] 未登录用户可看但"加入"置灰
- [x] WebSocket 实时进度生效
- [x] 列表页 API 字段错位时不崩
