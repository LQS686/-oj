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
RUN npm config set registry https://registry.npmmirror.com && npm install

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

# 安装必要的系统依赖（用于编译器）
# bash: runner.sh 依赖；coreutils: 提供 /usr/bin/time 用于资源统计回退
RUN apk add --no-cache \
    bash \
    coreutils \
    python3 \
    py3-pip \
    make \
    g++ \
    gcc \
    gfortran \
    openjdk11-jdk \
    musl-dev

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
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/package*.json ./

# 复制服务器和库文件
COPY --from=builder --chown=nextjs:nodejs /app/server.ts ./
COPY --from=builder --chown=nextjs:nodejs /app/lib ./lib
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.server.json ./

# 复制tailwind和postcss配置
COPY --from=builder --chown=nextjs:nodejs /app/tailwind.config.ts ./
COPY --from=builder --chown=nextjs:nodejs /app/postcss.config.mjs ./

# 复制node_modules中的prisma和tailwindcss
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@tailwindcss ./node_modules/@tailwindcss
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/tailwindcss ./node_modules/tailwindcss

# 安装生产依赖
RUN npm config set registry https://registry.npmmirror.com && npm install --omit=dev --ignore-scripts

# 创建必要的目录并设置权限
RUN mkdir -p /app/temp /app/logs && \
    chown -R nextjs:nodejs /app/temp /app/logs && \
    usermod -aG root nextjs

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# 启动命令 - 使用tsx运行server.ts
CMD ["npx", "tsx", "server.ts"]