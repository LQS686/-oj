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
# P0 修复（2026-07）：重建 runner 阶段文件结构。
#   之前问题：在 standalone 之外又额外 COPY server.ts / lib / prisma / tsconfig，
#   这些其实是 standalone 内部追踪的，结果造成 /app/ 下有双份文件互相干扰，
#   server.ts 运行时找不到正确的 lib 路径，导致进程启动后立即退出。
#   之前未察觉是因为只看到 (unhealthy) 而没看 logs。
#
#   修复策略：使用 next.config.ts 的 outputFileTracingIncludes 显式追踪
#   server.ts 和 lib（这是 Next.js 标准做法），然后只 COPY standalone 即可。
#   Prisma client 必须单独 COPY，因为 .prisma 是动态生成的。
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prisma client 必须单独 COPY（standalone 不追踪动态生成的内容）
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# 复制 tsx（自定义 server 启动器，在 devDependencies，standalone 不追踪）
# 错误日志：npm warn exec The following package was not found: tsx@4.23.1
# 修复：从 builder 阶段直接复制 tsx + 它的依赖 esbuild / get-tsconfig
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/tsx ./node_modules/tsx
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@esbuild ./node_modules/@esbuild
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/get-tsconfig ./node_modules/get-tsconfig

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

# 启动命令 - 使用 tsx 运行 server.ts（自定义 server，包含 socket.io）
#   cwd: /app，因为 next.config 的 outputFileTracingIncludes 已将 server.ts 复制到
#        /app/.next/standalone/server.ts，但我们需要从 /app 直接启动以便 npx tsx 能解析
#   注意：现在 server.ts / lib 都在 /app/ 顶层（来自 .next/standalone/ 整个目录被解压）
CMD ["npx", "tsx", "server.ts"]