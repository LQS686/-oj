# 在线编程平台 (Online Judge)

一个功能完整的在线编程平台，支持多语言代码提交、自动评测、实时反馈、团队协作、积分商城等功能。

[![Next.js](https://img.shields.io/badge/Next.js-16.0.0-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-7.0-green)](https://www.mongodb.com/)
[![Prisma](https://img.shields.io/badge/Prisma-6.17-blue)](https://www.prisma.io/)

## ✨ 功能特性

- 🔐 **用户认证系统** - JWT Token + 密码加密
- 📝 **题目管理** - 题目列表、详情展示、统计分析
- 💻 **代码提交** - 支持 C++、C、Java、Python、JavaScript
- ⚡ **自动评测** - 实时编译、执行、判定
- 👥 **团队系统** - 团队管理、成员权限、作业发布
- 💰 **积分与商城** - 积分获取、商品兑换、排行榜
- 📊 **提交记录** - 详细的评测结果和统计
- 🎨 **友好界面** - Monaco Editor 代码编辑器
- 🐳 **Docker 支持** - 一键部署，支持生产环境

## 🚀 快速开始

### 环境要求

- Node.js 20+
- MongoDB 7+ (支持 Replica Set)
- Redis 7+ (可选，用于队列)
- g++/gcc（C/C++ 编译器）
- Java JDK 11+（可选）
- Python 3（可选）

### 安装步骤

```bash
# 1. 克隆项目
git clone <repository-url>
cd oj-platform

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，配置必要的环境变量

# 4. 初始化数据库
npx prisma db push
npx tsx scripts/init-problems-mongo.ts

# 5. 启动开发服务器
npm run dev
```

### 环境变量配置

创建 `.env` 文件并配置以下环境变量：

```env
# MongoDB 连接字符串（必填）
DATABASE_URL=mongodb://localhost:27017/oj-platform

# JWT 密钥（必填，生产环境必须设置）
# 生成方法: openssl rand -base64 32
JWT_SECRET=your-secure-random-string-at-least-32-characters-long

# 运行环境
NODE_ENV=development

# 服务端口
PORT=3000

# 前端 URL（用于 CORS 配置）
FRONTEND_URL=http://localhost:3000

# Redis 连接（可选，用于队列）
REDIS_URL=redis://localhost:6379
```

### 访问应用

打开浏览器访问：http://localhost:3000

**测试账户**：
- 用户名：admin
- 密码：admin123

## 🐳 Docker 部署

### 快速部署

```bash
# 1. 复制环境变量文件
cp .env.example .env

# 2. 编辑 .env 文件，设置 JWT_SECRET
# JWT_SECRET=your-secure-random-string

# 3. 构建并启动服务
docker-compose up -d --build

# 4. 查看日志
docker-compose logs -f app

# 5. 停止服务
docker-compose down
```

### Docker 服务说明

| 服务 | 端口 | 说明 |
|------|------|------|
| app | 3000 | Next.js 应用 |
| mongo | 27017 | MongoDB 数据库 |
| redis | 6379 | Redis 缓存 |
| nginx | 80/443 | 反向代理 |

### 生产环境部署

```bash
# 设置生产环境变量
export NODE_ENV=production
export JWT_SECRET=$(openssl rand -base64 32)

# 构建并启动
docker-compose -f docker-compose.yml up -d --build
```

## 📖 文档

- [📘 API 文档](./docs/API_DOCUMENTATION.md)
- [📗 系统架构文档](./docs/ARCHITECTURE.md)
- [🚀 部署指南](./docs/DEPLOYMENT.md)
- [🛠️ 开发指南](./docs/DEVELOPMENT.md)

## 🧪 运行测试

```bash
# 运行所有测试
npm test

# 运行测试并生成覆盖率报告
npm test -- --coverage

# 监听模式
npm run test:watch
```

## 🏗️ 技术架构

### 核心架构优化 (2026/02 Update)

为了提高系统的可用性与性能，我们针对数据层进行了深度重构：

*   **副本集支持**：强制要求 MongoDB 运行在副本集 (Replica Set) 模式下，以支持事务操作和故障转移。
*   **读写分离**：
    *   **主库 (Primary)**：处理所有写操作 (`PrismaClient`, `MongoClient`)，配置 `WriteConcern: majority` 确保数据安全。
    *   **从库 (Secondary)**：处理非实时敏感的读操作 (`prismaRo`, `getMongoRoClient`)，配置 `ReadPreference: secondaryPreferred` 充分利用集群读取能力。
*   **连接池优化**：针对 Prisma 和原生驱动分别配置了 `maxPoolSize` 和超时参数，避免连接风暴。
*   **自动重试**：原生驱动层封装了 `withRetry` 机制，能够自动处理主从切换期间的瞬时连接错误 (`NotWritablePrimary`)。
*   **健康监控**：提供 `/api/health/db` 接口，实时监控副本集状态（节点角色、延迟）。

### 前端

- **框架**：Next.js 16 (App Router)
- **语言**：TypeScript
- **样式**：Tailwind CSS
- **编辑器**：Monaco Editor

### 后端

- **API**：Next.js API Routes
- **数据库**：MongoDB (Replica Set) + Prisma ORM (Read/Write Splitting)
- **认证**：JWT + bcryptjs
- **通信**：WebSocket (Socket.IO) 用于实时评测状态推送

### 评测系统

- **队列**：基于 EventEmitter 的内存队列
- **编译**：g++, gcc, javac
- **执行**：child_process
- **判定**：输出比对 + 时间/内存检查

## 📁 项目结构

```
oj-platform/
├── app/                    # Next.js App Router (页面与API)
│   ├── api/               # API Routes
│   ├── admin/             # 管理后台
│   ├── teams/             # 团队模块
│   └── ...
├── components/             # React 组件
├── lib/                    # 工具库
│   ├── judge/             # 评测系统核心
│   ├── points/            # 积分系统核心
│   └── ...
├── prisma/                 # 数据库模型
├── scripts/                # 工具脚本
├── tests/                  # 测试用例
├── docs/                   # 文档
├── Dockerfile              # Docker 构建文件
├── docker-compose.yml      # Docker Compose 配置
└── .dockerignore           # Docker 忽略文件
```

## 🛡️ 安全机制

### 认证与授权
- JWT Token 认证
- 密码加密存储（bcryptjs）
- 基于角色的访问控制 (RBAC) - 管理员、团队所有者、成员

### 代码安全
- 时间限制（防止无限循环）
- 内存限制（防止内存泄漏）
- 临时文件隔离
- 危险代码检测（系统调用限制）

### 安全头配置
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- X-XSS-Protection: 1; mode=block
- Content-Security-Policy 配置
- Referrer-Policy: strict-origin-when-cross-origin

## 🚀 部署

### 生产环境

```bash
# 构建
npm run build

# 启动
npm start

# 或使用 PM2
pm2 start npm --name "oj-platform" -- start
```

### Docker 部署（推荐）

```bash
# 使用 Docker Compose 一键部署
docker-compose up -d --build
```

## 🔄 更新日志

### 2026/02/28
- ✅ 添加 Docker 部署支持
- ✅ 添加 JWT_SECRET 环境变量验证
- ✅ 添加 dotenv 配置支持
- ✅ 优化 next.config.ts，添加 standalone 输出模式
- ✅ 添加健康检查配置
- ✅ 更新安全头配置

### 2026/02/27
- ✅ 全面修复 TypeScript 类型安全问题
- ✅ 增强 JWT 认证安全性
- ✅ 添加 WebSocket 安全验证
- ✅ 统一错误处理机制
- ✅ 添加输入验证和 XSS 防护
- ✅ 添加 134 个测试用例

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License
