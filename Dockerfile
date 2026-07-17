# syntax=docker/dockerfile:1.4
# 启用 BuildKit 缓存：apk / npm / next build 三处慢操作使用 --mount=type=cache，
# 即使 docker compose build --no-cache 也能复用 host 上的包缓存，大幅缩短构建时间。

# 构建阶段 - 使用国内镜像源
FROM node:20-alpine AS builder

WORKDIR /app

# 设置构建时环境变量（仅构建时使用，不写入镜像层）
ARG JWT_SECRET
ARG DATABASE_URL=mongodb://localhost:27017/oj_platform
# NEXT_PUBLIC_* 必须在构建时传递，会被硬编码到 JS 中
ARG NEXT_PUBLIC_API_URL=https://dsoj.run
ARG NEXT_PUBLIC_BASE_URL=https://dsoj.run
ENV NEXT_PHASE=phase-production-build
ENV JWT_SECRET=${JWT_SECRET}
ENV DATABASE_URL=${DATABASE_URL}
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_BASE_URL=${NEXT_PUBLIC_BASE_URL}

# 使用清华 TUNA 镜像源（比 aliyun 更稳定，gcc/g++ 等大包下载不易卡住）
# BuildKit 缓存 /var/cache/apk，下次 build 时直接复用已下载的 .apk 包
RUN --mount=type=cache,target=/var/cache/apk,sharing=locked \
    sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories

# 安装依赖（使用淘宝镜像）
# BuildKit 缓存 /root/.npm，下次 build 时复用已下载的 npm 包
COPY package*.json ./
# 修复：使用 --ignore-scripts 跳过 package.json 中的 postinstall="prisma generate"，
#   因为此时 prisma/schema.prisma 还未被 COPY 进来，prisma generate 会失败。
#   真实的 prisma generate 在下面 COPY prisma 之后单独执行。
RUN --mount=type=cache,target=/root/.npm \
    npm config set registry https://registry.npmmirror.com && npm install --ignore-scripts

# 复制Prisma schema并生成客户端
COPY prisma ./prisma/
RUN npx prisma generate

# 复制源代码
COPY . .

# 构建应用
# BuildKit 缓存 .next/cache，下次 build 时复用 Next.js 的构建缓存（如 SWC 转换、TypeScript 类型检查）
RUN --mount=type=cache,target=/app/.next/cache \
    npm run build

# 生产阶段 - 使用国内镜像源
FROM node:20-alpine AS runner

WORKDIR /app

# 使用清华 TUNA 镜像源 + BuildKit 缓存
# 关键：apk add 是构建中最慢的步骤（gcc/g++ 等大包 ~100MB+），缓存后下次 build 秒级完成
RUN --mount=type=cache,target=/var/cache/apk,sharing=locked \
    sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories && \
    apk add --no-cache \
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
# USE_DOCKER=false: 在容器内直接执行评测更简单可靠（容器内已装 g++/gcc）。
# sibling 容器卷挂载复杂（评测容器看不到宿主文件），如需 Docker 沙箱需另配 docker.sock + 卷挂载。
ENV USE_DOCKER=false

# 创建非root用户
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# 复制 standalone 产物（Next.js 构建输出 + 追踪到的依赖）
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/package*.json ./

# 显式复制 server.ts 和 lib（standalone 不追踪自定义 server 文件）
# 这一步是必须的：server.ts 用 tsx 启动，不在 Next.js 构建图里，
# 默认 standalone 不会包含它，必须显式 COPY。
COPY --from=builder --chown=nextjs:nodejs /app/server.ts ./
COPY --from=builder --chown=nextjs:nodejs /app/lib ./lib
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.server.json ./

# 复制tailwind和postcss配置
COPY --from=builder --chown=nextjs:nodejs /app/tailwind.config.ts ./
COPY --from=builder --chown=nextjs:nodejs /app/postcss.config.mjs ./

# 复制node_modules中的prisma和tailwindcss
# .prisma 是动态生成的，standalone 不追踪，必须单独 COPY
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@tailwindcss ./node_modules/@tailwindcss
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/tailwindcss ./node_modules/tailwindcss

# 安装生产依赖
# 关键：standalone 模式只追踪 Next.js 构建图里的依赖，但 server.ts 动态 import 了
# 很多模块（dotenv、socket.io、ioredis、jsonwebtoken、openai、mongodb、bcryptjs、adm-zip、
# katex、nodemailer 等），这些可能没被完全追踪。必须运行 npm install --omit=dev 确保所有
# 生产依赖都装上。tsx 现在在 dependencies 中（之前在 devDependencies），也会被装上。
# BuildKit 缓存 /root/.npm，复用 builder 阶段已下载的 npm 包
RUN --mount=type=cache,target=/root/.npm \
    npm config set registry https://registry.npmmirror.com && npm install --omit=dev --ignore-scripts

# 创建必要的目录并设置权限
# addgroup nextjs root: 将 nextjs 加入 root 组，使 runner.sh 中的 ulimit 命令可执行。
# 原因：Alpine Linux 默认不允许非 root 用户执行 ulimit -v/-t/-s（需 CAP_SYS_RESOURCE）。
# 之前用 usermod -aG root，但 Alpine 默认不装 shadow 包（usermod 不存在）。
# addgroup 是 BusyBox 内置命令，无需额外依赖。
# 长期方案：改用 Docker 沙箱评测（USE_DOCKER=true）可避免此权限提升。
# public/uploads/avatars: 头像持久化目录，docker-compose 会挂载 volume 到此处，
# 预创建并 chown 确保 nextjs 用户有写权限（volume 首次挂载时属主为 root，需要显式赋权）
RUN mkdir -p /app/temp /app/logs /app/public/uploads/avatars && \
    chown -R nextjs:nodejs /app/temp /app/logs /app/public/uploads && \
    addgroup nextjs root

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# 启动命令 - 使用 tsx 运行 server.ts（自定义 server，包含 socket.io）
# tsx 已在 dependencies 中，npm install --omit=dev 会安装，npx 可直接本地解析。
CMD ["npx", "tsx", "server.ts"]
