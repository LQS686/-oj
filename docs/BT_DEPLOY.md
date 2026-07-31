# 宝塔面板部署指南

## 架构

```
浏览器 → Nginx :80/:443（宝塔）
              ↓ 反代
       127.0.0.1:3000（Docker app）
              ↓
        Docker 网络 172.28.0.0/16
           ├── mongo:27017（副本集 rs0）
           └── redis:6379
```

- **宝塔 Nginx**：SSL、域名、反向代理（含 WebSocket）
- **Docker Compose**：应用 + MongoDB + Redis
- 宝塔自带 Redis **不要占用**；本项目用容器内 Redis

---

## 一键流程（推荐）

### 1. 安装 Docker

宝塔 → 软件商店 → **Docker管理器** → 安装。

### 2. 克隆代码

```bash
cd /www/wwwroot
git clone https://gitee.com/carefree-old-man/dashan-oj.git
cd dashan-oj
```

### 3. 执行部署脚本

**已备案 / 已有 HTTPS 域名：**

```bash
sudo bash scripts/bt-deploy.sh https://dsoj.run
```

**备案中，先用 IP 的 HTTP 测试：**

```bash
sudo bash scripts/bt-deploy.sh http://你的服务器IP
```

脚本会自动：

1. 检查 Docker / Compose / 磁盘（至少约 4GB 可用）
2. 配置国内镜像加速（如尚未配置；**不会覆盖**已有自定义 `daemon.json`，必要时用 python 合并）
3. 生成 `.env`（含 JWT / ENCRYPTION_KEY / Redis·Mongo 密码）
4. 按 URL 协议设置 `FORCE_SECURE_COOKIE`（HTTP→false，HTTPS→true）
5. 生成 `mongo-keyfile`
6. 拉取基础镜像并构建应用（首次约 5–10 分钟）
7. 先拉起 mongo/redis，再启动 app，并做健康检查
8. 写出 Nginx 片段：`nginx/baota-proxy.conf`（端口与 `APP_HOST_PORT` 一致）

> **说明**：HTTP 临时站可在 `NODE_ENV=production` 下运行（脚本已兼容）。  
> 切勿在 HTTPS 站点关闭 Secure Cookie。

常用可选参数：

```bash
sudo bash scripts/bt-deploy.sh --no-build          # 仅重启，不重建镜像
sudo bash scripts/bt-deploy.sh --prune             # 升级时顺带清理 7 天前 BuildKit 缓存
sudo bash scripts/bt-deploy.sh --skip-mirror       # 不改 /etc/docker/daemon.json
```

### 4. 配置宝塔网站

1. 网站 → 添加站点 → 域名填脚本提示的域名（或 IP）
2. HTTPS 站：SSL → Let's Encrypt → 申请证书
3. 设置 → 配置文件 → 粘贴 `nginx/baota-proxy.conf` 内容并保存

### 5. 验证

浏览器打开站点 → **注册首个账号**（自动成为系统管理员）。

本机探针：

```bash
curl -sf http://127.0.0.1:3000/healthcheck-static && echo OK
curl -sf http://127.0.0.1:3000/api/health/db && echo DB_OK
```

---

## 升级 / 切域名

```bash
cd /www/wwwroot/dashan-oj
git pull
sudo bash scripts/bt-deploy.sh
```

切到正式 HTTPS 域名（会更新 `.env` 并**强制重建**镜像，因 `NEXT_PUBLIC_*` 构建期固化）：

```bash
sudo bash scripts/bt-deploy.sh https://dsoj.run
```

仅重启、不重建镜像：

```bash
sudo bash scripts/bt-deploy.sh --no-build
```

磁盘紧张时升级并清理旧构建缓存：

```bash
sudo bash scripts/bt-deploy.sh --prune
```

---

## 日常运维

```bash
cd /www/wwwroot/dashan-oj

# 有 compose 插件用 docker compose；仅有独立程序则用 docker-compose
docker compose ps 2>/dev/null || docker-compose ps
docker compose logs -f app 2>/dev/null || docker-compose logs -f app
docker compose restart app 2>/dev/null || docker-compose restart app

# 停止 / 启动（数据在 volume，不会丢）
docker compose down 2>/dev/null || docker-compose down
docker compose up -d 2>/dev/null || docker-compose up -d
```

### 清理构建垃圾

```bash
docker system df
docker image prune -f
docker container prune -f
# 仅清 7 天前的 build cache（保留近期 BuildKit 缓存，切勿 -af 全清）
docker builder prune -af --filter "until=168h"
```

⚠️ **禁止**：`docker system prune -af --volumes`（会删掉 mongo/redis 数据卷）。

---

## 常见问题

| 问题                                          | 处理                                                                                                                                                                                                                                                                                                |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 构建报 `libasan` / `libubsan` no such package | Alpine/musl 无这两个包。请 `git pull` 后重跑（Dockerfile 已移除）。评测默认不开 ASan/UBSan。                                                                                                                                                                                                        |
| 未检测到 docker compose 插件                  | OpenCloudOS/宝塔常只有独立 `docker-compose`。新脚本会自动检测并尝试安装。也可先手动：`curl -fsSL https://get.daocloud.io/docker/compose/releases/download/v2.29.7/docker-compose-linux-x86_64 -o /usr/local/bin/docker-compose && chmod +x /usr/local/bin/docker-compose && docker-compose version` |
| 首次部署 app 起不来 / Cookie 登不上           | HTTP 必须用 `http://IP` 部署；脚本会设 `FORCE_SECURE_COOKIE=false`。HTTPS 必须为 `true`。                                                                                                                                                                                                           |
| `FORCE_SECURE_COOKIE=false` 启动失败          | 旧版会在生产直接拒绝。请 `git pull` 后重跑脚本；HTTPS 站不要关 Secure。                                                                                                                                                                                                                             |
| mongo 一直 unhealthy，app 起不来              | 已改为带账号的 healthcheck；仍失败时看 `docker compose logs mongo`，确认存在非空 `mongo-keyfile`。                                                                                                                                                                                                  |
| `mongo-keyfile: no such file`                 | `sudo bash scripts/bt-deploy.sh` 会生成；或：`openssl rand -base64 512 \| tr -d '\\n' > mongo-keyfile && chmod 600 mongo-keyfile`                                                                                                                                                                   |
| 构建 ENOSPC / 磁盘满                          | 先 `docker image prune -f`；脚本预检可用空间 < 4GB 会直接退出。                                                                                                                                                                                                                                     |
| 镜像拉取失败                                  | 检查 `/etc/docker/daemon.json` 的 `registry-mirrors`，`systemctl restart docker`。脚本默认不覆盖已有自定义 daemon；可用 `--skip-mirror` 跳过                                                                                                                                                        |
| 改域名后前端仍请求旧地址                      | 必须重建：`sudo bash scripts/bt-deploy.sh https://新域名`（不要用 `--no-build`）                                                                                                                                                                                                                    |
| API 502                                       | `docker compose ps`；等健康检查通过；看 `docker compose logs -f app`                                                                                                                                                                                                                                |
| 80/443 冲突                                   | `lsof -i :80` / 宝塔里关掉占用站点                                                                                                                                                                                                                                                                  |
| 3000 端口被占用                               | 脚本会提示；可改 `.env` 的 `APP_HOST_PORT` 后重跑，并重新粘贴 `nginx/baota-proxy.conf`（端口已写入片段）                                                                                                                                                                                            |
| 粘贴 Nginx 后 WebSocket 断线                  | 确认存在 `location /socket.io/`，且 `X-Forwarded-Proto` 与站点协议一致                                                                                                                                                                                                                              |

---

## 部署注意（踩坑摘要）

1. **`NEXT_PUBLIC_*` 构建期固化** — 改 `FRONTEND_URL` 必须重建 app 镜像。
2. **Cookie Secure** — HTTP 关、HTTPS 开；与 `FRONTEND_URL` 协议保持一致（脚本会自动纠正）。
3. **CSP 勿加 `upgrade-insecure-requests`**（HTTP 站静态资源会挂）。
4. **监听 `0.0.0.0`** — Dockerfile 已设 `HOSTNAME=0.0.0.0`；compose 默认只把端口绑到 `127.0.0.1:3000` 给 Nginx。
5. **runner 阶段必须 `npm ci --omit=dev`** — standalone 追不全自定义 `server.ts` 依赖；勿删。
6. **`.prisma` 必须在 `npm ci` 之后回拷** — `npm ci` 会清空 `node_modules`；若先 COPY 再 ci，生成客户端丢失，app 会以 `Prisma` named export 报错崩溃重启。
7. **`tsx` 必须带 `--conditions=react-server`** — 与本地 `npm start` 一致；否则 `server-only` 在自定义 server 里直接抛错。
8. **须显式 COPY `server.ts` / `lib` / `prisma`** — 不要用 tracing 冒充。
9. **健康检查用 `/healthcheck-static`** — 不要改回依赖动态路由的 `/api/health` 作容器探活。
10. **`.env` 值不要包反引号**。

更细的编译 / 评测相关说明见仓库历史注释与 `Dockerfile`。
