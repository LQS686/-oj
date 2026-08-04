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
2. 配置国内镜像加速（**幂等合并**已有 `daemon.json`：保留原配置，追加缺失的镜像源；仅实际变更时重启 Docker）
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
sudo bash scripts/bt-deploy.sh --yes               # 跳过交互确认（宝塔终端推荐）
```

> **宝塔终端用户注意**：宝塔 Web 终端是 TTY，脚本中的 `read` 交互提示会阻塞终端。
> 当升级时恰好有进行中的评测，脚本会弹出 `确认继续重启？(y/N)` 等待输入，
> 若不注意会导致终端"卡死"。**推荐在宝塔终端中始终加 `--yes`** 跳过交互确认。
> 不加 `--yes` 时，`read` 已设 60s 超时自动取消，不会永久阻塞。

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
sudo bash scripts/bt-deploy.sh --yes
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
| 宝塔终端卡死 / 无响应                         | 脚本在检测到进行中评测时会 `read` 等待确认，宝塔 Web 终端是 TTY 会阻塞。已加 60s 超时自动取消；**推荐加 `--yes` 跳过交互**：`sudo bash scripts/bt-deploy.sh --yes`。若已卡死，Ctrl+C 中断后加 `--yes` 重跑。                                                                                          |
| 构建报 `libasan` / `libubsan` no such package | Alpine/musl 无这两个包。请 `git pull` 后重跑（Dockerfile 已移除）。评测默认不开 ASan/UBSan。                                                                                                                                                                                                        |
| 未检测到 docker compose 插件                  | OpenCloudOS/宝塔常只有独立 `docker-compose`。新脚本会自动检测并尝试安装。也可先手动：`curl -fsSL https://get.daocloud.io/docker/compose/releases/download/v2.29.7/docker-compose-linux-x86_64 -o /usr/local/bin/docker-compose && chmod +x /usr/local/bin/docker-compose && docker-compose version` |
| 首次部署 app 起不来 / Cookie 登不上           | HTTP 必须用 `http://IP` 部署；脚本会设 `FORCE_SECURE_COOKIE=false`。HTTPS 必须为 `true`。                                                                                                                                                                                                           |
| `FORCE_SECURE_COOKIE=false` 启动失败          | 旧版会在生产直接拒绝。请 `git pull` 后重跑脚本；HTTPS 站不要关 Secure。                                                                                                                                                                                                                             |
| mongo 一直 unhealthy，app 起不来              | 已改为要求 **PRIMARY** 的 healthcheck；看 `docker compose logs mongo`，确认存在非空 `mongo-keyfile`。若日志有 `NotYetInitialized`，执行下方「修复副本集」。                                                                                                                                         |
| API 全站 503 `SERVICE_UNAVAILABLE`            | 多为 Mongo 副本集未 PRIMARY，Prisma 连续失败触发熔断。先修副本集（见下），再 `docker compose restart app`；或等约 60s 熔断窗口结束。探针：`curl -sf http://127.0.0.1:3000/api/health/db`（需管理员）/ 看 `compose logs app`。                                                                       |
| 登录页无注册入口                              | 查 `curl -s https://你的域名/api/settings/public`：`needsBootstrap=true` 应显示「创建管理员」；二者皆 false 表示库中已有用户且关闭了开放注册。管理员登录后在后台打开「开放注册」，或见下方 mongosh 开启。                                                                                           |
| `mongo-keyfile: no such file`                 | `sudo bash scripts/bt-deploy.sh` 会生成；或：`openssl rand -base64 512 \| tr -d '\\n' > mongo-keyfile && chmod 600 mongo-keyfile`                                                                                                                                                                   |
| 构建 ENOSPC / 磁盘满                          | 先 `docker image prune -f`；脚本预检可用空间 < 4GB 会直接退出。                                                                                                                                                                                                                                     |
| 镜像拉取失败 / 下载慢                        | 检查 `/etc/docker/daemon.json` 的 `registry-mirrors`，`systemctl restart docker`。脚本默认多源 fallback（`docker.1panel.live` / `docker.1ms.run` / `docker.xuanyuan.me` / `docker.m.daocloud.io`），不覆盖已有自定义 daemon。手动配置示例见下方「配置镜像加速」。                                                                                                              |
| 改域名后前端仍请求旧地址                      | 必须重建：`sudo bash scripts/bt-deploy.sh https://新域名`（不要用 `--no-build`）                                                                                                                                                                                                                    |
| API 502                                       | `docker compose ps`；等健康检查通过；看 `docker compose logs -f app`                                                                                                                                                                                                                                |
| 80/443 冲突                                   | `lsof -i :80` / 宝塔里关掉占用站点                                                                                                                                                                                                                                                                  |
| 3000 端口被占用                               | 脚本会提示；可改 `.env` 的 `APP_HOST_PORT` 后重跑，并重新粘贴 `nginx/baota-proxy.conf`（端口已写入片段）                                                                                                                                                                                            |
| 粘贴 Nginx 后 WebSocket 断线                  | 确认存在 `location /socket.io/`，且 `X-Forwarded-Proto` 与站点协议一致                                                                                                                                                                                                                              |

### 配置镜像加速（镜像拉取慢 / 失败时）

脚本首次部署会自动写入多源 `registry-mirrors`（见 `bt-deploy.sh` 的 `ensure_docker_mirrors`）。若你的服务器已配置过 `daemon.json` 或镜像仍慢，可手动配置：

```bash
# 1a. 若 /etc/docker/daemon.json 不存在或为空，直接写入加速源（多源 fallback，按可用性顺序）：
sudo tee /etc/docker/daemon.json >/dev/null <<'JSON'
{
  "registry-mirrors": [
    "https://docker.1panel.live",
    "https://docker.1ms.run",
    "https://docker.xuanyuan.me",
    "https://docker.m.daocloud.io"
  ]
}
JSON

# 1b. 若已存在自定义 daemon.json，请先备份再合并（勿用 tee 整文件覆盖，会丢原有配置）：
sudo cp /etc/docker/daemon.json /etc/docker/daemon.json.bak
# 将上方 "registry-mirrors" 数组合并进现有 JSON 后保存

# 2. 重启 Docker 使其生效
sudo systemctl restart docker

# 3. 验证：拉取 mongo:7 应显著提速
sudo docker pull mongo:7
```

> 说明：公共加速源可能随政策/维护动态变化；若某个源失效，Docker 会自动尝试下一个（多源 fallback）。也可只保留当前最快的源。`--skip-mirror` 可跳过脚本的加速配置逻辑（适合已有自建加速的服务器）。

### 修复 Mongo 副本集（API 503 / NotYetInitialized）

`DATABASE_URL` 带 `replicaSet=rs0`。若数据卷在首次 `rs.initiate` 失败后已落盘，官方 `initdb` 不会再跑，节点会一直无 PRIMARY，Prisma 连续失败 → 熔断 → 全站 API 503。

在项目目录执行（密码取自 `.env` 的 `MONGO_ROOT_PASSWORD`）：

```bash
# 查看是否 PRIMARY（应输出 true）
docker compose exec -T mongo mongosh --quiet \
  -u admin -p "$MONGO_ROOT_PASSWORD" --authenticationDatabase admin \
  --eval 'db.hello().isWritablePrimary'

# 若为 false / 报 NotYetInitialized，手动初始化：
docker compose exec -T mongo mongosh --quiet \
  -u admin -p "$MONGO_ROOT_PASSWORD" --authenticationDatabase admin \
  --eval 'try { rs.status() } catch (e) { rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "mongo:27017" }] }) }'

# 等 PRIMARY 后再重启应用并清熔断缓存
docker compose restart app
docker compose exec -T redis sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli KEYS "error-block:*" | xargs -r redis-cli DEL'
```

新版 `scripts/mongo-init.sh` 会在**每次**启动时尝试 initiate / 修正 host；`git pull` 后执行 `docker compose up -d mongo`（或整站 `bt-deploy`）即可自愈。

### 确认是否真有用户（空库应无注册用户）

公开接口 `needsBootstrap=false` 表示当时 `User.count()>0`。全新部署按设计应为空库；若你确认不该有用户，先查：

```bash
docker compose exec -T mongo mongosh --quiet \
  -u admin -p "$MONGO_ROOT_PASSWORD" --authenticationDatabase admin \
  --eval 'db.getSiblingDB("oj_platform").User.find({}, {username:1,email:1,role:1,createdAt:1}).toArray()'
```

- **有文档**：多半是此前短暂注册成功残留（mongo volume 会保留）。要重新走「首个管理员」可删用户（慎用）：
  `db.getSiblingDB("oj_platform").User.deleteMany({})`
- **无文档**仍显示「暂不开放」：旧版在读库/计数失败时会把 `needsBootstrap` 错写成 `false`；升级后失败时改为 `true`，仍展示「创建管理员账号」。

### 开启开放注册（库中已有用户）

```bash
# 确认当前公开设置
curl -s http://127.0.0.1:3000/api/settings/public

# 在 Mongo 中打开 allowRegistration（集合名以 Prisma @@map 为准，一般为 SystemConfig）
docker compose exec -T mongo mongosh --quiet \
  -u admin -p "$MONGO_ROOT_PASSWORD" --authenticationDatabase admin \
  --eval '
    const app = db.getSiblingDB("oj_platform");
    const doc = app.SystemConfig.findOne({ key: "system_settings" });
    if (!doc) { print("no system_settings row"); quit(1); }
    const v = doc.value || {};
    v.allowRegistration = true;
    app.SystemConfig.updateOne({ _id: doc._id }, { $set: { value: v } });
    printjson(v.allowRegistration);
  '

docker compose restart app
```

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

---

## 评测系统架构

### 评测路径（单一）

```
judger.ts → executor-core.ts → runner.sh → dsoj-watch（C 同步监视器）→ 选手进程
```

无 Docker 沙箱、无 bwrap 分支，全平台统一一条路径：

| 组件 | 职责 |
|------|------|
| `dsoj-watch` | C 同步进程，100µs 采样 RssAnon 内存 + wait4 rusage CPU 时间 + CLOCK_MONOTONIC 墙钟 |
| `runner.sh` | 设置 ulimit（栈/CPU/进程数/FD/文件大小），调用 dsoj-watch 执行选手程序 |
| `ulimit` | 系统级软限制：`-t` CPU 秒、`-s` 栈大小、`-u` 进程数、`-n` FD、`-f` 文件大小 |

### 资源限制机制

| 资源 | 限制方式 | 说明 |
|------|----------|------|
| CPU 时间 | `dsoj-watch` wait4 rusage + `ulimit -t` | TLE 判定用真实 CPU（realCpuMs），不受并发影响 |
| 墙钟时间 | `dsoj-watch` CLOCK_MONOTONIC + Node setTimeout 硬杀 | 防 sleep 型死循环 |
| 内存 | `dsoj-watch` RssAnon 采样 | 不含共享库，精确 |
| 输出大小 | `dsoj-watch` 实时检测 + runner.sh 退出后 stat | OLE 触发 SIGKILL，退出码 153 |
| 栈大小 | `ulimit -s` | 默认 8MB |
| 进程数 | `ulimit -u` | 默认 4096 |

### 临时文件

评测临时文件（编译产物、stdin/stdout/answer）写入 `/app/temp/judge/`，挂载为 **tmpfs（内存盘）**：

```yaml
# docker-compose.yml
tmpfs:
  - /app/temp:rw,exec,size=512m,uid=1001,gid=1001
```

- `exec`：允许执行编译产物（缺省 tmpfs 带 noexec，会导致全部 RE）
- `uid/gid=1001`：挂载即属 nextjs 用户（缺省 root，导致 EACCES）
- 容器重启自动清空

### 关键配置项

| 环境变量 / 设置 | 默认值 | 说明 |
|----------------|--------|------|
| `JUDGE_MAX_CONCURRENT` | 2（代码默认；部署脚本生成 `.env` 时保守设 1） | 同时评测的提交数（建议 = CPU 核数 - 1） |
| `JUDGE_CASE_CONCURRENCY` | 3（4核） | 单提交内测点并发数 |
| `JUDGE_LARGE_CASE_CONCURRENCY` | 同 caseConcurrency | 大测点（>2MB）并发数 |
| `JUDGE_ENABLE_ASAN` | false | AddressSanitizer，开启需 2-3x 内存 |
| `JUDGE_ENABLE_UBSAN` | false | UndefinedBehaviorSanitizer |

查看当前运行时配置：

```bash
docker compose logs app | grep "评测运行时配置"
```

---

## 评测性能优化

### 已实施优化

| 优化项 | 效果 | 实施方式 |
|--------|------|----------|
| glibc 替代 musl | 消除 7x printf/scanf/math 慢 | Dockerfile 基础镜像 alpine → debian-slim |
| tmpfs 替代磁盘卷 | 消除百万行 I/O 磁盘延迟 | docker-compose.yml `app_temp` volume → tmpfs |
| `-march=native` | 利用 CPU AVX2/AVX-512 自动向量化，10-20% | compiler.ts 编译参数 |
| 统一评测路径 | 无分支探测失败、无回退开销 | 删除 Docker 沙箱 / bwrap 分支 |
| 测点磁盘缓存 | 避免每次回源 Mongo 拉百万行字符串 | init.ts 启动自检 data/testdata 可写 |

### 服务器 CPU 调优

腾讯云 S5 实例为 KVM 虚拟机，CPU 频率由 hypervisor 管理，guest 内核不暴露 `cpufreq` sysfs，无法在容器内或宿主机内调整 governor。此优化路径不适用。

### 性能基准

| 环境 | 耗时 | 说明 |
|------|------|------|
| 本地 WSL（高频 CPU） | ~1.6s | 基准参照 |
| 云端优化前 | ~3.4s | alpine + musl + 磁盘 + bwrap |
| 云端优化后 | ~2.9s | glibc + tmpfs + -march=native + 统一路径 |

### 剩余瓶颈

云端 2.5GHz 单核 vs 本地更高频率 CPU，差距约 40%，只能通过硬件升级消除。软件层面已无优化空间。

---

## 评测故障排查

### 全部 RE（time=0）

**原因**：tmpfs 缺少 `exec` 标志，编译产物无法执行。

**检查**：

```bash
docker compose exec app mount | grep /app/temp
# 应包含 exec，若显示 noexec 则有问题
```

**修复**：确认 docker-compose.yml 中 tmpfs 选项包含 `exec`。

### EACCES: permission denied, mkdir '/app/temp/judge'

**原因**：tmpfs 缺少 `uid/gid`，默认属 root。

**修复**：确认 docker-compose.yml 中 tmpfs 选项包含 `uid=1001,gid=1001`。

### 评测 SE（系统错误）

**检查日志**：

```bash
docker compose logs app --tail 50 | grep -E "评测|EACCES|error"
```

常见原因：
- `/app/data/testdata` 不可写 → `docker compose exec -u root app chown -R 1001:1001 /app/data`
- MongoDB 连接失败 → 见上方「修复 Mongo 副本集」
- dsoj-watch 未编译 → `docker compose exec app ls -la /app/lib/judge/dsoj-watch`

### 评测性能异常（比本地慢很多）

**检查清单**：

```bash
# 1. 确认镜像基于 debian-slim（非 alpine）
docker compose exec app cat /etc/os-release | grep PRETTY_NAME

# 2. 确认 tmpfs 生效
docker compose exec app mount | grep /app/temp

# 3. 确认 CPU 频率（腾讯云 KVM 不暴露 cpufreq，跳过）
cat /proc/cpuinfo | grep "model name" | head -1

# 4. 确认 -march=native 生效（编译日志）
docker compose logs app | grep "march"
```
