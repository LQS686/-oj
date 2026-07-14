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
2. 域名 DNS 已解析到服务器 IP
3. 宝塔安全组已放行 80/443 端口

---

## 第一步：安装 Docker

宝塔 → 软件商店 → 搜索「Docker管理器」→ 安装。

---

## 第二步：克隆项目

宝塔 → 终端（或 SSH 登录），执行：

```bash
cd /www/wwwroot
git clone https://gitee.com/carefree-old-man/dashan-oj.git oj-platform
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

浏览器访问 `https://dsoj.run`，使用以下账号登录：

| 角色 | 用户名 | 密码 |
|------|--------|------|
| 管理员 | admin | admin123 |
| 测试用户 | user1 | user123（user1~user10） |

---

## 升级更新

在宝塔终端中执行：

```bash
cd /www/wwwroot/oj-platform
git pull
sudo bash scripts/bt-deploy.sh
```

脚本会自动重新构建应用镜像并重启服务，**数据库数据不受影响**。

---

## 日常运维

```bash
cd /www/wwwroot/oj-platform

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
| MongoDB 副本集未初始化 | `docker compose logs mongo` 查看日志，确认 keyfile 权限为 400 |
| 构建超过 10 分钟 | 首次构建较慢，后续升级仅增量构建 |
| API 返回 502 | 等待 40 秒健康检查通过后刷新 |
