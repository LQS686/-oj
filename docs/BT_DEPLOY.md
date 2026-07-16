# 宝塔面板部署指南

## 架构

```
浏览器 → https://dsoj.run (宝塔 Nginx :443)
              ↓
       127.0.0.1:3000 (Docker app 容器)
              ↓
        Docker 内部网络 (172.28.0.0/16)
           ├── mongo:27017 (MongoDB 7 副本集)
           └── redis:6379  (Redis 7)
```

- **宝塔 Nginx**：负责 SSL 终止、域名路由、HTTPS
- **Docker**：负责应用 + 数据库 + 缓存，与宿主机隔离
- **宝塔 Redis**：保持运行不使用，Docker 内自有一套 Redis

---

## 前置条件

1. 服务器已安装宝塔面板
2. 域名 DNS 已解析到服务器 IP（可选，域名备案期间可用 IP 测试）
3. 宝塔安全组已放行 80/443 端口

---

## 场景 A：域名已备案

如果域名已备案完成，直接按下面的步骤操作即可。

---

## 场景 B：域名备案中，先用 IP 测试

如果域名还在备案，可以先用服务器 IP 测试，等备案完成后再切换。

### 用 IP 测试的部署步骤

1. **首次部署时使用 IP 作为站点 URL**：

   ```bash
   cd /www/wwwroot/dashan-oj
   sudo bash scripts/bt-deploy.sh http://43.139.231.170
   ```

   > ⚠️ **注意**：URL 必须是 `http://` 开头，不能用 `https://`（IP 无法申请证书）

   `.env` 中的 `FORCE_SECURE_COOKIE` 必须设为 `false`，否则 Cookie 在 HTTP 下无法保存：

   ```bash
   cd /www/wwwroot/dashan-oj
   sed -i 's/FORCE_SECURE_COOKIE=.*/FORCE_SECURE_COOKIE=false/' .env
   ```

2. **宝塔 Nginx 配置（仅 HTTP）**：

   宝塔 → 网站 → 添加站点 → 域名填服务器 IP `43.139.231.170`

   配置文件使用以下简化版（无 SSL）：

   ```nginx
   server {
       listen 80;
       server_name 43.139.231.170;

       client_max_body_size 50M;

       location /socket.io/ {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_read_timeout 86400;
       }

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

3. **修改 Cookie 配置**（HTTP 下必须）：

   ```bash
   # HTTP 协议下必须禁用 secure cookie，否则无法登录
   sed -i 's/FORCE_SECURE_COOKIE=.*/FORCE_SECURE_COOKIE=false/' .env
   docker compose restart app
   ```

4. **测试访问**：

   浏览器访问 `http://43.139.231.170`，点击"注册"创建首个管理员账号

### 域名备案完成后切换

1. **修改 .env 文件**：

   ```bash
   cd /www/wwwroot/dashan-oj
   # 编辑 .env，将 FRONTEND_URL 改为域名
   sed -i 's|FRONTEND_URL=.*|FRONTEND_URL=https://dsoj.run|' .env
   sed -i 's|NEXT_PUBLIC_API_URL=.*|NEXT_PUBLIC_API_URL=https://dsoj.run|' .env
   sed -i 's|NEXT_PUBLIC_BASE_URL=.*|NEXT_PUBLIC_BASE_URL=https://dsoj.run|' .env
   ```

2. **强制重新构建镜像**（必须，因为 `NEXT_PUBLIC_*` 在构建时硬编码）：

   ```bash
   docker compose build --no-cache app
   docker compose up -d
   ```

3. **配置 Nginx SSL**：

   宝塔 → 网站 → 找到原站点 → 添加域名 `dsoj.run` → SSL → Let's Encrypt → 申请证书

   然后替换配置文件为下面的 HTTPS 版本。

---

## 第一步：安装 Docker

宝塔 → 软件商店 → 搜索「Docker管理器」→ 安装。

---

## 第二步：克隆项目

宝塔 → 终端（或 SSH 登录），执行：

```bash
cd /www/wwwroot
git clone https://gitee.com/carefree-old-man/dashan-oj.git
cd oj-platform
```

---

## 第三步：一键部署

```bash
sudo bash scripts/bt-deploy.sh https://dsoj.run
```

脚本会自动完成：

1. 生成 `.env` 配置（密码密钥随机生成）
2. 生成 MongoDB 副本集 KeyFile
3. 拉取基础镜像（MongoDB、Redis）
4. 构建 OJ 应用镜像（约 5 分钟）
5. 启动所有 Docker 服务
6. 等待健康检查通过
7. 输出 Nginx 配置供粘贴

---

## 第四步：配置宝塔 Nginx

脚本运行完后会输出 Nginx 配置。执行以下操作：

1. **宝塔 → 网站 → 添加站点**
   - 域名：`dsoj.run`
   - 其他默认即可

2. **SSL → Let's Encrypt → 申请证书**

3. **设置 → 配置文件 → 粘贴脚本输出的 Nginx 配置**

配置模板如下（`替换域名`）：

```nginx
server {
    listen 80;
    server_name dsoj.run;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name dsoj.run;

    ssl_certificate /www/server/panel/vhost/cert/dsoj.run/fullchain.pem;
    ssl_certificate_key /www/server/panel/vhost/cert/dsoj.run/privkey.pem;

    client_max_body_size 50M;

    # WebSocket 支持（评测提交）
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 86400;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 第五步：验证

浏览器访问 `https://dsoj.run`（或 `http://服务器IP`）。

> **注意**：系统管理员账号是**首位注册用户**，没有预设的 `admin` 账号。首次访问请点击"注册"创建管理员账号。

---

## 升级更新

在宝塔终端中执行：

```bash
cd /www/wwwroot/dashan-oj
git pull
sudo bash scripts/bt-deploy.sh
```

脚本会自动重新构建应用镜像并重启服务，**数据库数据不受影响**。

---

## 日常运维

```bash
cd /www/wwwroot/dashan-oj

# 查看容器状态
docker compose ps

# 查看应用日志
docker compose logs -f app

# 重启某个服务
docker compose restart app
docker compose restart mongo
docker compose restart redis

# 停止所有服务
docker compose down

# 启动所有服务
docker compose up -d
```

---

## 常见问题

| 问题 | 解决方法 |
|------|---------|
| 80/443 端口冲突 | 检查是否有其他进程占用：`lsof -i :80` |
| Docker 镜像拉取失败 | 脚本会自动配置 Docker 镜像加速器（docker.1ms.run + docker.xuanyuan.me），如仍失败可在 `/etc/docker/daemon.json` 中更换加速地址后执行 `systemctl restart docker` |
| MongoDB 副本集未初始化 | `docker compose logs mongo` 查看日志，keyfile 由容器自动生成无需手动管理 |
| 构建超过 10 分钟 | 首次构建较慢，后续升级仅增量构建 |
| API 返回 502 | 等待 40 秒健康检查通过后刷新 |

---

## 部署注意事项（重要！）

以下是部署过程中踩过的坑，后续开发和维护时务必注意：

### 1. NEXT_PUBLIC_* 环境变量在构建时硬编码

`NEXT_PUBLIC_API_URL` 和 `NEXT_PUBLIC_BASE_URL` 会在 `next build` 时被硬编码到客户端 JS 中。

- **修改 `FRONTEND_URL` 后必须重新构建镜像**：`docker compose build --no-cache app`
- 仅修改 `.env` 文件后重启容器**不会生效**，因为客户端 JS 中的 URL 已固化
- Dockerfile 通过 `ARG` 接收这些值，docker-compose.yml 从 `FRONTEND_URL` 传递

### 2. HTTP 部署必须禁用 Secure Cookie

HTTP 协议下浏览器不会保存带 `Secure` 标志的 Cookie，导致登录后刷新页面返回 401。

- `.env` 中 `FORCE_SECURE_COOKIE=false`（IP 测试时必须）
- docker-compose.yml 已将 `FORCE_SECURE_COOKIE` 传递给容器
- login/register 路由中通过三值逻辑处理：`true` / `false` / 未设置

### 3. CSP 不能包含 upgrade-insecure-requests

`upgrade-insecure-requests` 指令会强制浏览器将 HTTP 请求升级为 HTTPS。

- HTTP 部署时会导致静态资源（CSS/JS）请求变为 `https://` 协议而加载失败
- 域名切换到 HTTPS 后方可考虑添加此指令
- 配置位于 `next.config.ts` 的 `headers()` 函数中

### 4. 服务器必须绑定 0.0.0.0

`server.ts` 中 `hostname` 必须为 `0.0.0.0`，不能用 `localhost`。

- `localhost` 只监听 127.0.0.1，Docker 容器外无法访问
- Dockerfile 中已设置 `ENV HOSTNAME="0.0.0.0"`

### 5. 评测编译必须使用 spawn（不能用 exec）

Alpine Linux 上 `exec`（通过 shell 执行命令）存在兼容性问题。

- `lib/judge/compiler.ts` 中使用 `spawn` 直接调用命令数组
- `spawn` 不经过 shell 解析，更可靠且安全
- 切勿改回 `exec`，否则评测编译会静默失败（exitCode=1，stderr 为空）

### 6. runner.sh 路径必须用 process.cwd()（不能用 __dirname）

ESM/tsx 环境下 `__dirname` 不可靠（可能指向 npx 缓存目录）。

- `lib/judge/compiler.ts` 和 `lib/judge/executor.ts` 中使用 `process.cwd()`
- `runner.sh` 位于 `lib/judge/runner.sh`，通过 `join(process.cwd(), 'lib', 'judge', 'runner.sh')` 定位

### 7. nextjs 用户需要 root 组权限（非沙箱评测模式）

Alpine Linux 默认不允许非 root 用户执行 `ulimit`（runner.sh 中用于资源限制）。

- Dockerfile 中 `addgroup nextjs root` 解决此问题（Alpine 无 `usermod`，用 `addgroup`）
- 如移除此行，评测编译会失败（spawn exitCode=1，stderr 为空）
- 长期方案：改用 Docker 沙箱评测（`USE_DOCKER=true`）可避免此权限提升

### 8. .env 文件值不要用反引号

`.env` 文件中值的反引号（`` ` ``）在 shell 中是命令替换符号，可能导致解析问题。

```
# 错误
FRONTEND_URL=`http://example.com`
# 正确
FRONTEND_URL=http://example.com
```

### 9. Dockerfile runner 阶段必须保留 `npm install --omit=dev`（P0！）

**这是 2026-07-16 多日宕机的根因，切勿再次移除！**

Next.js standalone 模式只追踪构建图里的依赖，**不会追踪自定义 server.ts 动态 import 的模块**（dotenv、socket.io、ioredis、jsonwebtoken、openai、mongodb、bcryptjs、adm-zip、katex、nodemailer 等）。移除 `npm install --omit=dev` 会导致这些生产依赖全部缺失，server.ts 启动即崩溃。

- **必须保留**：`RUN npm config set registry https://registry.npmmirror.com && npm install --omit=dev --ignore-scripts`
- **不要为了省磁盘空间而移除它**：如需节省磁盘，用 `docker builder prune -af` 清理构建缓存
- **`tsx` 必须在 `dependencies` 中**（不能在 `devDependencies`）：server.ts 生产环境用 tsx 启动，`npm install --omit=dev` 必须能装上它

### 10. Dockerfile runner 阶段必须显式 COPY server.ts 和 lib

Next.js standalone **不会自动追踪自定义 server 文件**。必须显式 COPY：

```dockerfile
COPY --from=builder --chown=nextjs:nodejs /app/server.ts ./
COPY --from=builder --chown=nextjs:nodejs /app/lib ./lib
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.server.json ./
```

**不要用 `outputFileTracingIncludes` 替代显式 COPY**：tracing 机制会在 `/app/` 下产生双份文件冲突，导致 server.ts 找不到正确的 lib 路径。

### 11. Healthcheck 必须用静态页面

`/api/health` 是动态 API route，任何 import 失败都会让它返回 404。Healthcheck 必须用静态页面 `/healthcheck-static`（`force-static`），编译期固定产物，不依赖任何 lib。
