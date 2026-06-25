# 大山OJ (Dashan OJ)

一个功能完整的在线编程平台 (Online Judge)，支持多语言代码提交、自动评测、实时反馈、班级协作、训练题单与竞赛等功能。

[![Next.js](https://img.shields.io/badge/Next.js-16.0.0-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-7.0-green)](https://www.mongodb.com/)
[![Prisma](https://img.shields.io/badge/Prisma-6.17-blue)](https://www.prisma.io/)

## 功能特性

### 核心功能
- **用户认证系统** — JWT Token + httpOnly Cookie 双模式认证，密码 bcrypt 加密
- **题目管理** — 题目列表、详情展示（KaTeX 数学公式渲染）、统计分析、AI 辅助出题
- **题库筛选** — 内嵌搜索栏；难度下拉多选；标签弹窗多选（OR 匹配）
- **代码提交** — 支持 C++ (C++17)、C (C11)、Java (Java 17)、Python (Python 3.10)、JavaScript (Node.js 18)
- **自动评测** — 实时编译执行判定，WebSocket 推送评测进度，支持时间/内存限制
- **评测结果** — AC/WA/TLE/MLE/RE/CE 全状态支持，详细测试点结果

### 首页与公告
- **学习仪表盘** — 今日解题、连续打卡、本周通过率、Rating 等统计
- **系统公告** — 首页 6 列卡片展示，置顶与过期时间；详情页 `/announcements/[id]`；后台「运营管理 → 系统公告」

### 班级系统
- **班级管理** — 创建/加入班级，邀请与申请机制，成员角色权限（班主任/助教/学生）
- **班级作业** — 标签页式作业详情，题目切换与代码编辑提交一体
- **完成度追踪** — 学生完成情况矩阵、提交记录与代码查看
- **笔记系统** — 班级知识库
- **班级排行榜** — 基于解题与表现的班级内排名（非积分商城）

### 列表与导航（卡片布局）
- 竞赛、训练题单、班级列表、首页「近期作业 / 即将开始竞赛 / 系统公告」等大屏均为 **6 列卡片网格**（`grid-cols-2 sm:grid-cols-3 lg:grid-cols-6`）

### 其他功能
- **竞赛模式** — ACM/OI 赛制，实时榜单，赛题管理
- **训练题单** — 官方 / 竞赛真题 / 我的题单分类
- **社区讨论** — 题解评论、帖子发布
- **AI 能力** — AI 模型配置、智能辅助出题、代码分析
- **响应式设计** — 移动端 Drawer 抽屉菜单适配
- **Docker 部署** — 一键部署，MongoDB 副本集 + Redis 缓存 + Nginx 反代

> **说明**：班级积分账户、积分商城、积分流水等功能已移除；历史 MongoDB 集合需自行清理（见更新日志）。

## 快速开始

### 环境要求

- Node.js 20+
- MongoDB 7+ (Replica Set 模式)
- Redis 7+ (可选，用于队列)
- g++/gcc（C/C++ 编译器）

### 安装步骤

```bash
# 克隆项目
git clone https://gitee.com/carefree-old-man/dashan-oj.git
cd dashan-oj

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env

# 初始化数据库（含 SystemAnnouncement 等新模型）
npx prisma db push
npx prisma generate

# 启动开发服务器
npm run dev
```

访问 http://localhost:3000

### 环境变量

```env
DATABASE_URL=mongodb://localhost:27017/dashan-oj
JWT_SECRET=your-secret-key-at-least-32-chars
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:3000
REDIS_URL=redis://localhost:6379
```

## Docker 部署

```bash
cp .env.example .env
# 编辑 .env 设置 JWT_SECRET
docker-compose up -d --build
docker-compose logs -f app
```

| 服务 | 端口 | 说明 |
|------|------|------|
| app | 3000 | Next.js 应用 |
| mongo | 27017 | MongoDB (副本集) |
| redis | 6379 | Redis 缓存 |
| nginx | 80/443 | 反向代理 |

## 技术架构

### 前端
- **框架**: Next.js 16 App Router + React 19
- **语言**: TypeScript
- **样式**: Tailwind CSS
- **状态管理**: React Context (UserContext / SettingsContext)
- **通信**: WebSocket (Socket.IO) 实时评测推送

### 后端
- **API**: Next.js API Routes，`withApi` / `withPermission` 统一鉴权与响应
- **数据库**: MongoDB Replica Set + Prisma ORM
- **认证**: JWT Token (localStorage) + httpOnly Cookie 双模式
- **安全**: RBAC 权限控制、输入验证、XSS 防护、内容安全策略

### 评测系统
- 内存队列 (EventEmitter) / BullMQ（可选）
- Docker 沙箱隔离编译执行
- 输出比对 + 时间/内存检查
- 危险代码检测 (系统调用限制)

## 项目结构

```
dashan-oj/
├── app/                          # Next.js App Router
│   ├── api/                      # API 路由
│   │   ├── announcements/        # 公开系统公告
│   │   ├── admin/announcements/  # 后台公告管理
│   │   └── home/dashboard        # 登录用户首页聚合
│   ├── admin/                    # 管理后台（含系统公告）
│   ├── announcements/            # 公告列表与详情
│   ├── classes/[id]/             # 班级（作业/成员/题目/笔记等）
│   ├── problem/[id]/             # 题目详情与提交
│   ├── problems/                 # 题库列表（筛选 UI）
│   ├── contests/                 # 竞赛（卡片列表）
│   ├── training/                 # 训练题单（卡片列表）
│   └── discuss/                  # 讨论/题解
├── components/
│   ├── common/                   # EducationalPageShell、ClassWorkspaceShell 等
│   ├── training/TrainingCard.tsx # 支持 grid 卡片变体
│   └── ...
├── lib/
│   ├── api/                      # withApi、validation、response
│   ├── announcement/             # 系统公告 service
│   ├── home/dashboard.ts         # 首页仪表盘数据
│   ├── class/                    # 班级业务层
│   ├── problem/、submission/、contest/、training/、judge/、ai/
│   ├── cache.ts
│   └── prisma.ts
├── prisma/schema.prisma          # 含 SystemAnnouncement；已移除 Points* 模型
├── hooks/、contexts/
└── scripts/                      # 迁移脚本等
```

### 业务层调用链

```
Route → withApi.auth / withApi.public / withPermission → lib/<domain>/service.ts → prisma
                                                      ↓
                                              lib/cache.ts (TTL 缓存)
```

## 更新日志

### 2026/06（近期）
- **系统公告**：`SystemAnnouncement` 模型；公开 API + 后台 CRUD；首页与 `/announcements` 6 列卡片 + 详情页
- **首页仪表盘**：移除「推荐训练」「继续学习」「班级动态」；近期作业 / 即将竞赛 / 公告均为 6 列布局
- **列表页卡片化**：竞赛、训练题单、班级列表改为 6 列卡片网格
- **题库筛选**：难度下拉多选、标签弹窗多选；搜索与筛选项单行内嵌；移除排序筛选
- **移除班级积分**：删除 `lib/points`、`PointsAccount` / `PointsHistory` / `PointsShopItem` / `PointsExchange` 及班级积分页面与 API；`ClassWorkspaceShell` 去掉积分导航
- **成员活动**：`getClassMemberActivity` 不再包含积分流水与 `totalPoints`

### 2026/06（架构）
- **API 中间件**：`lib/api/withApi.ts`、`withPermission`；统一 `ok()` / 错误码
- **业务层抽离**：auth / user / contest / problem / submission / notification / class / training 等
- **团队 → 班级重构**：模型与路由统一为 Class；`scripts/migrate-team-to-class.ts`
- **稳定性**：错误边界、logger、Prisma 调用收敛至 service 层

### 2026/05
- 作业详情页标签页 + 字母切换式布局；完成情况矩阵与提交记录弹窗
- 导航栏移动端 Drawer；KaTeX 修复；`fetchWithAuth` 统一封装

### 2026/02
- Docker 部署；MongoDB 副本集；WebSocket 评测推送；安全头与 XSS 防护

## 许可证

MIT License