# 题单（Problem List）功能 Spec

## Why
平台当前已有"训练"（Training）概念的数据模型与最简列表页，但功能非常基础，缺少洛谷/东方博宜 OJ 题单的核心要素：
- 没有作者/创建者
- 没有分类、标签、封面
- 没有"发布/草稿"状态
- 没有"推荐"位
- 没有"加入题单"记录
- 没有题单详情页（点进去就是 404）
- 没有管理后台（无法创建/编辑题单）
- 列表页存在数据加载 bug：进度不实时更新、按钮卡死等问题（与上一批 /problem/[id] 修复的 bug 同源）

需要一个完整的题单系统，让管理员/教师可以创建主题化题组（如"动态规划入门"、"CSP-J 真题集"），让学生可以浏览、加入、跟踪自己的进度。

## What Changes

### 新增能力
- **题单分类（TrainingCategory）**：管理题单的分类（如"入门"、"进阶"、"竞赛真题"）
- **加入记录（TrainingEnrollment）**：用户"加入"一个题单，跟踪加入时间
- **题单详情页** `/training/[id]`：展示题单描述、题目列表、用户进度
- **管理后台题单管理**：
  - 列表 `/admin/trainings`
  - 创建 `/admin/trainings/create`
  - 编辑（题目增删/排序）`/admin/trainings/[id]`
- **公开题单浏览增强**：分类筛选、关键字搜索、推荐题单置顶
- **题单详情实时进度**：用户做题后，进度实时更新（沿用之前 WebSocket + 轮询模式）

### 增强现有 Training 模型
- `authorId` / `author`：创建者（管理员/教师）
- `status`：草稿(draft) / 已发布(published)
- `isRecommended`：是否推荐（首页/列表置顶）
- `categoryId`：分类
- `tags`：标签
- `cover`：封面图 URL（可选）
- `joinCount`：加入人数（冗余字段，便于排序/显示）
- `viewCount`：浏览量
- `description` 支持 markdown

### 增强 TrainingProblem（题单↔题目关联）
- `score`：题目分数（默认 100）
- `required`：是否必做（影响进度统计）

### Bug 修复（沿用 /problem/[id] 修复模式）
- **app/training/page.tsx 列表不更新**：之前因 `data.data.items` 字段错位等 bug 已修，但进度显示、加入按钮等仍是 fetch 一次后不再更新
- **加入题单按钮可能卡死**：需要 useRef + 解耦 submitting 模式
- **列表不防御性处理**：旧代码 `trainingsWithProgress` 等使用 `.map` 前需 `Array.isArray` 检查

## Impact

### 受影响的 spec
无（这是新功能，与现有 spec 无破坏性冲突）

### 受影响的代码
- **Prisma schema**：`prisma/schema.prisma`
  - 修改 `model Training`
  - 修改 `model TrainingProblem`
  - 新增 `model TrainingCategory`
  - 新增 `model TrainingEnrollment`
- **Service / Lib**：
  - `lib/training/service.ts`（重写扩展）
  - `lib/training/types.ts`（新增）
  - `lib/cache.ts` 的 keys 中加 `training:list`、`training:enrollment` 等
- **API 路由**：
  - `app/api/trainings/route.ts`（列表/创建）
  - `app/api/trainings/[id]/route.ts`（详情/更新/删除）
  - `app/api/trainings/[id]/problems/route.ts`（题目管理，PATCH 排序/分数/必做）
  - `app/api/trainings/[id]/join/route.ts`（加入/退出）
  - `app/api/trainings/[id]/progress/route.ts`（已有，进度查询）
  - `app/api/training-categories/route.ts`（新增，分类 CRUD）
- **用户页面**：
  - `app/training/page.tsx`（重写：分类筛选 + 搜索 + 推荐位 + 防御性 + 实时进度）
  - `app/training/[id]/page.tsx`（**新增**：题单详情）
- **管理后台**：
  - `app/admin/trainings/page.tsx`（**新增**：题单列表）
  - `app/admin/trainings/create/page.tsx`（**新增**：创建题单）
  - `app/admin/trainings/[id]/page.tsx`（**新增**：编辑题单 + 题目管理）
  - `app/admin/layout.tsx` 或侧边栏加链接
- **组件**：
  - `components/training/TrainingCard.tsx`（**新增**）
  - `components/training/JoinTrainingButton.tsx`（**新增**，解决卡死 bug）
  - `components/training/ProblemListItem.tsx`（**新增**）
  - `components/training/CategoryFilter.tsx`（**新增**）

### 不破坏
- 现有 `/api/trainings` GET 仍能跑（保持返回 `{ items, pagination }` 结构）
- 现有 `/api/trainings/[id]/progress` 路由保持
- 现有 `TrainingProblem` 关联数据不丢失（schema 演进采用默认值）

## ADDED Requirements

### Requirement: 题单分类
The system SHALL provide 题单分类 (TrainingCategory) 用于归类题单。

#### Scenario: 分类列表展示
- **WHEN** 用户访问 `/training`
- **THEN** 页面顶部显示分类 Tab/筛选条，点击切换后只显示该分类下已发布的题单
- **AND** 全部 tab 显示所有已发布题单

#### Scenario: 分类管理
- **WHEN** 管理员在 `/admin/trainings/categories` 添加/编辑/删除分类
- **THEN** 分类立即生效，列表页可见
- **AND** 删除分类时，若有题单引用，提示"该分类下有 N 个题单，无法删除"

### Requirement: 题单管理
The system SHALL allow 管理员 创建/编辑/删除 题单。

#### Scenario: 创建题单
- **WHEN** 管理员在 `/admin/trainings/create` 填写标题、描述、分类、标签、可见性、推荐位
- **AND** 选择关联的题目（按顺序）后提交
- **THEN** 题单创建成功，跳转到详情编辑页
- **AND** 草稿状态的题单在用户端不可见

#### Scenario: 编辑题单题目
- **WHEN** 管理员在 `/admin/trainings/[id]` 添加/移除题目，拖拽排序
- **AND** 设置每题的分数和"是否必做"
- **THEN** 题目顺序立即生效（PATCH 后立即写库）
- **AND** 用户端题单详情页题目顺序同步更新

#### Scenario: 删除题单
- **WHEN** 管理员删除题单
- **THEN** 软删除（status=archived）或硬删除（推荐硬删除 + 关联表级联）
- **AND** 已加入该题单的用户记录（TrainingEnrollment）一并清理

### Requirement: 用户加入题单
The system SHALL allow 用户 加入/退出 题单。

#### Scenario: 加入题单
- **WHEN** 用户在题单详情页或卡片上点击"加入"
- **THEN** 创建 TrainingEnrollment 记录
- **AND** 题单的 joinCount + 1（原子更新）
- **AND** 按钮变为"已加入 / 继续学习"

#### Scenario: 退出题单
- **WHEN** 用户点击"已加入"按钮（带确认）
- **THEN** 删除 TrainingEnrollment 记录
- **AND** 题单的 joinCount - 1
- **AND** 按钮恢复"加入"

#### Scenario: 进度实时更新
- **WHEN** 用户在题单中做题并提交
- **THEN** 题单详情页的题目状态（未做/尝试中/已通过）实时更新
- **AND** 进度条和百分比实时变化
- **实现要求**：
  - 接入 `useSubmissionSocket` 监听
  - **不要**用 `currentSubmissionId` 门控（沿用 /problem/[id] 修复模式）
  - 用 useRef 替代闭包陈旧值
  - 加入 useEffect 兜底
  - fetch 用 `cache: 'no-store'`

### Requirement: 题单详情页
The system SHALL provide 题单详情页 `/training/[id]`。

#### Scenario: 展示题单
- **WHEN** 用户访问 `/training/[id]`
- **THEN** 页面显示题单标题、描述、作者、分类、标签、封面
- **AND** 显示加入人数、浏览量
- **AND** 显示该用户进度（已通过/尝试/未做 数量 + 百分比）
- **AND** 题目列表（按 orderIndex 排序），每题标记状态
- **AND** 未登录用户可看题单但"加入"按钮置灰

#### Scenario: 题单不存在
- **WHEN** 用户访问不存在的 `/training/[invalid]`
- **THEN** 返回 404 页面（友好提示）
- **AND** 草稿状态题单对非作者/非管理员返回 404

### Requirement: 题单列表增强
The system SHALL enhance `/training` 列表页。

#### Scenario: 列表展示
- **WHEN** 用户访问 `/training`
- **THEN** 顶部显示推荐题单（isRecommended=true，按更新时间倒序，最多 3 个）
- **AND** 分类筛选条
- **AND** 关键字搜索（按标题/描述模糊匹配）
- **AND** 题单卡片列表，每卡显示：标题、描述、题数、加入人数、用户进度

#### Scenario: 防御性数据处理
- **WHEN** API 返回 `{ items, pagination }` 但结构异常（如 data.data 为 null）
- **THEN** 页面用 `Array.isArray()` 防御性回退到空数组
- **AND** 不抛出 TypeError

## MODIFIED Requirements

### Requirement: Training 模型
The `Training` model SHALL be extended with: `authorId`, `author`, `status`, `isRecommended`, `categoryId`, `category`, `tags`, `cover`, `joinCount`, `viewCount`, `description` (markdown).

#### Scenario: Schema 演进
- **WHEN** `prisma db push` 跑迁移
- **THEN** 现有 Training 记录保留（authorId 默认为首个 admin，status='published'，isRecommended=false，joinCount=0，tags=[]）
- **AND** 不需要重写 service 已有调用（兼容旧的 `isPublic` 字段）

### Requirement: TrainingProblem 关联
The `TrainingProblem` model SHALL add `score` (default 100) and `required` (default true) fields.

#### Scenario: 进度计算
- **WHEN** 计算用户进度
- **THEN** 分母 = 题单中所有 `required=true` 的题目数（不再是所有题数）
- **AND** 分子 = required 题目中已 AC 的数量

## REMOVED Requirements

无（不破坏现有功能）。

## 数据迁移

由于 Prisma schema 演进，所有现有 Training 记录需要默认值：
```ts
// 迁移脚本（手动执行或 prisma db seed 跑一次）
db.training.updateMany({
  where: { authorId: { $exists: false } },
  data: {
    authorId: <firstAdminId>,
    status: 'published',
    isRecommended: false,
    joinCount: 0,
    viewCount: 0,
    tags: [],
  }
})
```

## 设计原则（沿用之前修复的稳健模式）

1. **WebSocket 推送与 currentSubmissionId 解耦**：避免"评测中"按钮卡死、列表不更新
2. **useRef 替代闭包陈旧值**：避免 callback 拿到陈旧 state
3. **轮询兜底**：WebSocket 漏推/断连时 3s 拉一次
4. **`cache: 'no-store'`**：避免客户端缓存导致陈旧数据
5. **`Array.isArray` 防御**：API 响应结构异常时降级为空数组
6. **响应字段统一**：API 列表返回 `{ items, total, page, pageSize, totalPages }`（不分 `pagination`），避免 `data.data.items` vs `data.data.pagination.items` 错位
7. **主题化颜色**：用 `text-foreground` / `text-muted-foreground` / `bg-card` / `bg-muted` / `border-border`，不硬编码暗色
8. **后端权限**：`POST/PUT/DELETE /api/trainings/*` 仅 admin；`/join` 已登录用户；`GET` 公开
9. **错误友好**：404 / 500 不抛裸 stack；列表为空时显示"暂无题单"占位
