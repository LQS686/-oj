# OJ 平台教育化 UI 重设计方案

## 概述

将现有 OJ 平台从"营销风格 SaaS 落地页"重设计为"教学优先的编程练习平台"。核心方向：**内容优先、信息密度适中、状态直觉化、教学流程突出、长时间使用友好**。

## 现状分析

**技术栈**: Next.js 16 + React 19 + Tailwind CSS 4 + framer-motion + lucide-react + SWR + Monaco Editor + recharts + socket.io

**当前 UI 问题**:
- 过度装饰：渐变文字、发光阴影、浮动动画、脉冲呼吸、玻璃拟态 -- 分散学生注意力
- 首页是营销落地页而非学习入口，已登录用户看到的是产品宣传而非学习仪表盘
- 信息密度低，大量留白和装饰元素占据空间
- 班级/作业等教学核心功能的视觉层级不够突出
- 部分组件硬编码颜色（如 Breadcrumb 用 `bg-gray-50`），未走设计 Token
- `.glass-strong` 硬编码 `#FFFFFF`，暗色模式不切换

**关键文件**:
- `app/globals.css` -- 1112 行，全部设计 Token + 组件样式
- `tailwind.config.ts` -- Tailwind 扩展配置
- `app/layout.tsx` -- 根布局、字体加载
- `app/page.tsx` -- 首页（460 行，营销风格）
- `app/problems/page.tsx` -- 题库列表
- `app/problem/[id]/page.tsx` -- 题目详情
- `app/classes/page.tsx` -- 班级
- `app/training/page.tsx` -- 训练/题单
- `components/Navbar.tsx` + 子组件 -- 导航栏
- `components/AdminLayout.tsx` -- 管理后台
- `components/Breadcrumb.tsx` -- 面包屑（硬编码颜色）
- `lib/status.ts` -- 难度/状态颜色工具函数

---

## 设计方向

目标风格介于洛谷（实用主义）和 LeetCode Education（清晰结构）之间：
- **扁平化**，无阴影发光、无玻璃拟态
- **微圆角**（6-10px），不使用大圆角（16-24px）
- **细边框**（1px solid），用边框而非阴影区分层级
- **紧凑间距**，列表行高 40-44px
- **功能色克制使用**，仅用于状态指示

---

## 实施步骤

### 阶段一：设计 Token + 全局 CSS 基础设施

#### 步骤 1：重构 `app/globals.css` 设计 Token

**`:root` 变量块** -- 替换色彩系统：
- 主色：`#3B82F6` -> `#4F6AE8`（靛蓝，更沉稳）
- 辅助色：`#10B981` -> `#0D9488`（青绿）
- 强调色：`#F59E0B` -> `#E67E22`（暖橙）
- 背景色：`#F1F5F9` -> `#F5F6F8`（更浅中性灰）
- 前景色：`#0F172A` -> `#1A1D23`（更深近黑）
- 边框色：`rgba(148,163,184,0.35)` -> `#D4D7DD`（实色，非半透明）
- 圆角：`--radius` 从 `0.75rem`(12px) 缩小到 `0.5rem`(8px)
- 删除 `--glass-blur`、`--glass-opacity`、`--shadow-glow`、`--shadow-soft`、`--shadow-card`
- 新增 `--shadow-sm/md/lg`（扁平阴影）
- 新增难度色板变量：`--difficulty-easy` 到 `--difficulty-expert` 及对应背景色
- 过渡时间缩短：fast 100ms, normal 150ms, slow 250ms

**`.dark` 变量块** -- 同步更新：
- 背景从蓝黑 `#0F172A` 改为纯灰黑 `#111318`
- 边框改为实色 `#2D3139`
- 新增暗色难度色板

**`@theme inline` 块** -- 新增难度色映射，确保 Tailwind 类名可用

**删除项**：
- `body::before` 和 `body::after`（装饰性渐变背景 + 网格线）
- `.glass` 和 `.glass-strong` 类
- `.gradient-text` 和 `.glow` 类
- 所有装饰动画：`animate-float`、`animate-pulse-slow`、`animate-gradient`、`hover-lift`、`text-gradient-*`

**重写组件样式**：
- `.btn-*` 系列：渐变 -> 纯色，删除 hover translateY 和发光阴影，padding 缩小
- `.card`：删除 `::before` 伪元素光条，hover 仅改边框色，删除 translateY(-5px)
- `.card-static`：删除 box-shadow
- `.badge-*`：渐变 -> 纯色，删除发光
- `.avatar-fallback`：渐变 -> 纯色
- `.dropdown-item:hover`：从 `rgba(79,70,229,0.05)` 改为 `var(--primary-50)`

**新增组件样式**：
- `.difficulty-tag` + `.difficulty-easy/medium-easy/medium/medium-hard/hard/expert`
- `.status-tag` + `.status-ac/wa/tle/mle/re/ce/pending`

**更新 body 样式**：
- `padding-top` 从 88px 缩小到 56px（导航栏更紧凑）
- 删除 `::before` 和 `::after`

**更新滚动条**：颜色从 `rgba(59,130,246,0.25)` 改为 `var(--border)`

#### 步骤 2：更新 `tailwind.config.ts`

- `borderRadius` 跟随 CSS 变量缩小
- `boxShadow`：删除 `glow/soft/card`，新增 `sm/md/lg`
- `animation`：删除 `float/pulse-slow/gradient`
- `keyframes`：删除对应项
- `colors` 扩展中新增难度色

#### 步骤 3：更新 `app/layout.tsx`

- Google Fonts URL 移除 Poppins，仅保留 Inter + JetBrains Mono
- Toaster `toastOptions.style` 删除 `backdropFilter: 'blur(24px)'`

---

### 阶段二：核心组件更新

#### 步骤 4：重设计 Navbar

**`components/Navbar.tsx`**：
- 从浮动玻璃态（`glass-strong fixed top-4 left-4 right-4 rounded-2xl`）改为固定顶部栏（`fixed top-0 left-0 right-0 border-b bg-background-secondary`）
- 高度从 `h-16`(64px) 缩小到 `h-14`(56px)

**`components/navbar/Logo.tsx`**：
- 删除 `blur-lg opacity-40 animate-pulse-slow` 光晕
- 删除 `shadow-lg shadow-primary/30`
- 删除 `group-hover:scale-110`
- 简化为纯色图标 + 文字

**`components/navbar/NavLinks.tsx`**：
- 删除 `onMouseEnter/onMouseLeave` 的 `scale-105`
- 删除图标 `group-hover:rotate-3`
- `.nav-link.active` 改为底部 2px 实线指示器

#### 步骤 5：修复 `components/Breadcrumb.tsx`

- 硬编码 `bg-gray-50 border-gray-200 text-gray-400 text-blue-600` 全部替换为设计 Token

#### 步骤 6：更新 `components/common/Button.tsx`

- `variantClasses.primary` hover 从 `bg-primary/90` 改为 `bg-primary-dark`
- `variantClasses.ghost` hover 从 `hover:bg-accent` 改为 `hover:bg-muted`

#### 步骤 7：重设计 `components/AdminLayout.tsx`

- 侧边栏：删除 `linear-gradient(180deg, ...)` 渐变背景，改为纯 `var(--background-secondary)`
- 活跃菜单项：删除渐变 + 发光阴影，改为 `bg-primary text-white` 纯色
- Logo 区：删除渐变 + 发光
- 顶栏：删除 `backdrop-blur-xl`
- 用户头像：删除渐变 + 发光，改为纯色
- 菜单项分组：12 个菜单分为 3 组（内容管理 / 运营管理 / 系统管理），组间加分隔线
- `body.style.paddingTop` 从 `88px` 改为 `56px`

#### 步骤 8：更新难度/状态颜色工具函数

**`lib/status.ts`**：
- `getDifficultyColor` 返回新的 CSS 类名（`difficulty-easy` 等）而非内联 Tailwind 类
- 新增 `getDifficultyClass` 函数

**`lib/constants.ts`**：
- `DIFFICULTY_COLORS` 同步更新

---

### 阶段三：关键页面重设计

#### 步骤 9：重设计首页 `app/page.tsx`

**已登录用户 -- 学习仪表盘视图**：
- 顶部：快速统计条（今日已做题数、连续打卡天数、本周通过率）
- 中部：继续学习区（最近在做的题单/作业 + 进度条 + "继续做题"按钮）
- 下部：推荐题单、最新作业、即将开始的竞赛（横向卡片列表）
- 底部：班级动态（最近提交、同学进展）

**未登录用户 -- 简洁介绍视图**：
- 简洁 Hero：标题 + 一句话描述 + "开始学习"/"查看题库"两个按钮
- 平台特色：3-4 个简洁功能介绍（无动画、无渐变图标）
- 登录/注册 CTA：简洁卡片

**删除**：Hero 光球动画、Stats 区 gradient-text、Features 渐变图标方块 + hover 旋转、"为什么选择我们" section、CTA 区 animate-gradient 全屏渐变

**framer-motion**：仅保留页面入场淡入（`opacity: 0 -> 1`），删除所有 `whileInView` 位移、`staggerChildren`、`whileHover/whileTap` 缩放

#### 步骤 10：重设计题库列表 `app/problems/page.tsx`

- 搜索框从独立行移入标题行右侧
- 筛选面板从 AnimatePresence 弹出改为始终可见的紧凑行内筛选条
- 表格从 12 列 grid 改为语义化 `<table>`
- 状态列增强：AC 显示绿色勾 + 得分，非 AC 但已提交显示分数
- 难度列使用 `.difficulty-tag` 类
- 标签列最多 2 个 + `+N`
- 行 hover 仅改背景色，无上浮
- 删除每行 `motion.div` 逐行入场动画
- 删除页面标题左侧渐变图标方块

#### 步骤 11：优化题目详情 `app/problem/[id]/page.tsx`

- Tab 下划线从 `animate-gradient` 改为简单 `border-b-2 border-primary`
- 删除提交结果区的 `animate-pulse-slow`
- 删除 Modal 的 `shadow-primary/10 hover:shadow-primary/20`
- 面包屑改用 Breadcrumb 组件

#### 步骤 12：优化班级页 `app/classes/page.tsx`

- 删除 ClassCard 的 `hover:-translate-y-1`
- 删除头像渐变 + 发光
- 班级卡片增加"待完成作业数"和"最近活跃时间"
- 教师角色显示"教学概览"统计条

#### 步骤 13：优化训练页 `app/training/page.tsx`

- 删除标题区渐变图标方块
- TrainingCard 删除 `hover:border-primary/50 hover:shadow-md`，改为仅 `hover:border-primary`
- ProgressCircle 保持（有效信息可视化）
- SourceFilterCards 保持（好的视觉区分）

---

### 阶段四：全局清理

#### 步骤 14：全局搜索替换

批量处理以下模式（覆盖 `app/` 和 `components/` 目录）：

| 搜索模式 | 替换为 |
|----------|--------|
| `glass-strong` | `card-static` 或 `bg-card border border-border` |
| `gradient-text` | `text-foreground` |
| `glow` | 删除 |
| `shadow-primary/20` `shadow-primary/25` `shadow-primary/30` | 删除 |
| `animate-pulse-slow` | 删除 |
| `animate-float` | 删除 |
| `animate-gradient` | 删除 |
| `hover:scale-110` `hover:scale-115` `hover:scale-105` | 删除 |
| `hover:-translate-y-1` `hover:-translate-y-5` | 删除 |
| `group-hover:rotate-3` | 删除 |
| `bg-gradient-to-br from-primary to-primary-dark`（图标背景） | `bg-primary` |
| `bg-gradient-to-br from-primary to-secondary`（头像） | `bg-primary` |
| `blur-[150px]` `blur-[120px]` `blur-[180px]` | 删除 |
| `backdrop-blur-md` `backdrop-blur-xl` `backdrop-blur-sm` | 删除或保留极少数 |
| `rounded-2xl` `rounded-3xl`（容器） | `rounded-lg` |
| `bg-white dark:bg-card` | `bg-card` |
| `bg-muted/20` `bg-muted/30` `bg-muted/40` | `bg-muted` |

#### 步骤 15：暗色模式验证

- 检查所有页面在 `.dark` 类下的表现
- 修复遗漏的硬编码颜色

#### 步骤 16：响应式测试

- 移动端 / 平板端 / 桌面端三档验证

---

## 假设与决策

1. **不改动后端 API**：本次仅涉及前端 UI 层面的 CSS/TSX 修改
2. **不替换代码编辑器**：Monaco Editor 集成作为单独任务，本次仅优化 textarea 样式
3. **保留 framer-motion 依赖**：仅简化使用方式（仅淡入），不删除依赖
4. **首页已登录视图需要新增 API 调用**：复用现有 `/api/problems/status`、`/api/classes` 等
5. **字体统一为 Inter**：移除 Poppins，减少字体加载开销

## 验证方式

1. `npm run build` 确保无 TypeScript 编译错误
2. `npm run dev` 启动开发服务器，逐页检查：
   - 首页（已登录/未登录两种视图）
   - 题库列表（筛选、搜索、分页）
   - 题目详情（Tab 切换、代码提交）
   - 班级列表和班级详情
   - 训练/题单列表
   - 管理后台（侧边栏、各管理页面）
3. 切换暗色模式验证所有页面
4. 移动端/平板端响应式验证
