# 大山OJ (Dashan OJ)

一个功能完整的在线编程平台 (Online Judge)，支持多语言代码提交、自动评测、实时反馈、团队协作、积分商城等功能。

[![Next.js](https://img.shields.io/badge/Next.js-16.0.0-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-7.0-green)](https://www.mongodb.com/)
[![Prisma](https://img.shields.io/badge/Prisma-6.17-blue)](https://www.prisma.io/)

## ✨ 功能特性

### 核心功能
- 🔐 **用户认证系统** — JWT Token + httpOnly Cookie 双模式认证，密码 bcrypt 加密
- 📝 **题目管理** — 题目列表、详情展示（KaTeX 数学公式渲染）、统计分析、AI 辅助出题
- 💻 **代码提交** — 支持 C++ (C++17)、C (C11)、Java (Java 17)、Python (Python 3.10)、JavaScript (Node.js 18)
- ⚡ **自动评测** — 实时编译执行判定，WebSocket 推送评测进度，支持时间/内存限制
- 📊 **评测结果** — AC/WA/TLE/MLE/RE/CE 全状态支持，详细测试点结果

### 团队系统
- 👥 **团队管理** — 创建/加入团队，邀请码机制，成员角色权限控制（所有者/管理员/成员）
- 📋 **团队作业** — 标签页式作业详情（题目/完成情况），A/B/C 字母切换内嵌题目，代码编辑提交一体
- 📈 **完成度追踪** — 学生完成情况矩阵表（搜索/排序/筛选），点击分数查看提交记录弹窗+代码查看
- 🏆 **排行榜** — 团队内积分排名
- 📝 **笔记系统** — 团队知识库
- 🎯 **积分体系** — 积分获取规则、积分商城兑换商品

### 其他功能
- 🏅 **竞赛模式** — ACM/OI 赛制，实时榜单，赛题管理
- 🌐 **社区讨论** — 题解评论、帖子发布
- 🤖 **AI 能力** — AI 模型配置、智能辅助出题、代码分析
- 📱 **响应式设计** — 移动端 Drawer 抽屉菜单适配
- 🐳 **Docker 部署** — 一键部署，MongoDB 副本集 + Redis 缓存 + Nginx 反代

## 🚀 快速开始

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

# 初始化数据库
npx prisma db push

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

## 🐳 Docker 部署

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

## 🏗️ 技术架构

### 前端
- **框架**: Next.js 16 App Router + React 19
- **语言**: TypeScript
- **样式**: Tailwind CSS
- **状态管理**: React Context (UserContext / SettingsContext)
- **通信**: WebSocket (Socket.IO) 实时评测推送

### 后端
- **API**: Next.js API Routes
- **数据库**: MongoDB Replica Set + Prisma ORM (读写分离)
- **认证**: JWT Token (localStorage) + httpOnly Cookie 双模式
- **安全**: RBAC 权限控制、输入验证、XSS 防护、内容安全策略

### 评测系统
- 内存队列 (EventEmitter)
- Docker 沙箱隔离编译执行
- 输出比对 + 时间/内存检查
- 危险代码检测 (系统调用限制)

## 📁 项目结构

```
dashan-oj/
├── app/                    # Next.js App Router 页面与 API
│   ├── api/               # API 路由
│   ├── admin/             # 管理后台
│   ├── teams/[id]/        # 团队模块（作业/成员/题目/积分）
│   └── problem/[id]/      # 题目详情与提交
├── components/             # React 组件
│   ├── navbar/            # 导航栏组件
│   ├── problem/           # 题目相关组件
│   └── admin/             # 管理后台组件
├── lib/                    # 工具库
│   ├── judge/             # 评测核心
│   ├── points/            # 积分系统
│   ├── ai/                # AI 相关
│   └── api/base.ts        # fetchWithAuth 封装
├── prisma/                 # 数据库模型
├── hooks/                  # 自定义 Hooks
└── contexts/               # React Context
```

## 🔄 更新日志

### 2026/05
- ✅ 作业详情页重构为标签页 + A/B/C 字母切换式布局
- ✅ 内嵌题目内容展示与代码编辑提交一体化
- ✅ 学生完成情况矩阵表优化（居中对齐、字母列头、点击跳转）
- ✅ 提交记录弹窗（左侧记录列表 + 右侧代码查看 + 复制按钮）
- ✅ 导航栏优化（移动端 Drawer 抽屉、排行榜提升）
- ✅ Monaco Editor 替换为轻量 textarea 编辑器
- ✅ KaTeX 数学公式渲染修复
- ✅ JWT 认证双模式修复 + fetchWithAuth 统一封装

### 2026/02
- ✅ Docker 部署支持
- ✅ MongoDB 副本集 + 读写分离
- ✅ WebSocket 实时评测状态推送
- ✅ TypeScript 类型安全全面修复
- ✅ 安全头配置与 XSS 防护

## 📄 许可证

MIT License
