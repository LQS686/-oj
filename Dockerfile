# 构建阶段 - 使用国内镜像源
FROM node:20-alpine AS builder

WORKDIR /app

# 设置构建时环境变量（仅构建时使用，不写入镜像层）
ARG JWT_SECRET
ARG DATABASE_URL=mongodb://localhost:27017/oj_platform
# NEXT_PUBLIC_* 必须在构建时传递，会被硬编码到 JS 中
ARG NEXT_PUBLIC_API_URL=http://localhost:3000
ARG NEXT_PUBLIC_BASE_URL=http://localhost:3000
ENV NEXT_PHASE=phase-production-build
ENV JWT_SECRET=${JWT_SECRET}
ENV DATABASE_URL=${DATABASE_URL}
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_BASE_URL=${NEXT_PUBLIC_BASE_URL}

# 使用国内镜像源
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# 安装依赖（使用淘宝镜像）
COPY package*.json ./
# 修复：使用 --ignore-scripts 跳过 package.json 中的 postinstall="prisma generate"，
#   因为此时 prisma/schema.prisma 还未被 COPY 进来，prisma generate 会失败。
#   真实的 prisma generate 在下面 COPY prisma 之后单独执行。
RUN npm config set registry https://registry.npmmirror.com && npm install --ignore-scripts

# 复制Prisma schema并生成客户端
COPY prisma ./prisma/
RUN npx prisma generate

# 复制源代码
COPY . .

# 构建应用
RUN npm run build

# 生产阶段 - 使用国内镜像源
FROM node:20-alpine AS runner

WORKDIR /app

# 使用国内镜像源
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# 安装必要的系统依赖（仅支持 C/C++/Python 评测）
#   - bash: runner.sh 依赖
#   - coreutils: 提供 /usr/bin/time 用于资源统计回退
#   - python3: Python 解释器
#   - g++/gcc: C/C++ 编译器
#   - make/musl-dev: 标准构建工具链
#   - wget: docker-compose healthcheck 必需（Alpine 默认不装，~250KB）
#   - curl: 健康诊断备用（docker exec 时手动调用更直观）
# 移除项（评测机减负）：
#   - openjdk11-jdk: ~250MB（JDK + JRE）
#   - gfortran: ~80MB（Fortran 编译器，从未启用）
#   - py3-pip: ~50MB（pip 包管理器，运行时不需要）
# 减负后镜像预计：~600MB（原 ~1.2GB，节省 ~50%）
RUN apk add --no-cache \
    bash \
    coreutils \
    python3 \
    make \
    g++ \
    gcc \
    musl-dev \
    wget \
    curl

# 设置环境变量
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# USE_DOCKER=false: 在容器内直接执行评测更简单可靠（容器内已装 g++/gcc/openjdk）。
# sibling 容器卷挂载复杂（评测容器看不到宿主文件），如需 Docker 沙箱需另配 docker.sock + 卷挂载。
ENV USE_DOCKER=false

# 创建非root用户
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# 复制必要文件
# P1 修复（2026-07）：构建磁盘空间不足 (ENOSPC)。
#   根因：之前 runner 阶段既 COPY standalone + tailwindcss/prisma 子集，又
#   `npm install --omit=dev` 全量安装，磁盘峰值叠加 ~1.5GB 触发 ENOSPC。
#   Next.js standalone 已经自带最精简的 node_modules（output_file_tracing），
#   无需再 npm install。仅需补充 standalone 不追踪的依赖：
#     - .prisma client（动态加载，被 .swc 排除）
#     - @prisma client（运行时入口）
#     - tailwindcss 构建产物（runtime 端不需，仅打包时，但 next build 已生成 static）
#   解决方案：删除 `npm install --omit=dev` 行 + 冗余的 tailwind COPY（构建时已内嵌到 .next/static）。
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/package*.json ./

# 复制服务器和库文件
COPY --from=builder --chown=nextjs:nodejs /app/server.ts ./
COPY --from=builder --chown=nextjs:nodejs /app/lib ./lib
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.server.json ./

# 复制 Prisma 客户端（standalone 不会追踪这些动态加载文件）
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# 创建必要的目录并设置权限
# addgroup nextjs root: 将 nextjs 加入 root 组，使 runner.sh 中的 ulimit 命令可执行。
# 原因：Alpine Linux 默认不允许非 root 用户执行 ulimit -v/-t/-s（需 CAP_SYS_RESOURCE）。
# 之前用 usermod -aG root，但 Alpine 默认不装 shadow 包（usermod 不存在）。
# addgroup 是 BusyBox 内置命令，无需额外依赖。
# 长期方案：改用 Docker 沙箱评测（USE_DOCKER=true）可避免此权限提升。
RUN mkdir -p /app/temp /app/logs && \
    chown -R nextjs:nodejs /app/temp /app/logs && \
    addgroup nextjs root

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# 启动命令 - 使用tsx运行server.ts
CMD ["npx", "tsx", "server.ts"]