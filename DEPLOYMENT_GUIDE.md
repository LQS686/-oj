# Docker部署完全指南

## 问题诊断

您的Docker Desktop存在网络代理配置问题，导致无法访问任何外部镜像仓库：

```
HTTPS Proxy: http.docker.internal:3128
Error: dialing mirror.gcr.io:443 - connection timeout
```

## 解决方案

我已经为您准备了**三种解决方案**，请按顺序尝试：

---

## 方案一：自动配置（推荐）✅

### 步骤1：运行配置脚本

以**管理员身份**打开PowerShell，然后执行：

```powershell
powershell -ExecutionPolicy Bypass -File "e:\桌面\oj\scripts\configure-docker-mirrors.ps1"
```

这个脚本会自动：
- ✅ 配置中科大镜像加速器
- ✅ 备份现有配置
- ✅ 验证Docker Desktop状态

### 步骤2：重启Docker Desktop

脚本运行后，您需要：

1. 完全关闭Docker Desktop
2. 重新启动Docker Desktop
3. 等待Docker完全启动（约30秒）

### 步骤3：重新部署

```powershell
cd e:\桌面\oj
docker compose up -d --build
```

---

## 方案二：手动配置（如果方案一失败）

### 步骤1：打开Docker Desktop设置

1. 右键点击Docker Desktop图标
2. 选择 "Settings"
3. 进入 "Resources" → "Docker Engine"

### 步骤2：编辑配置

在编辑器中添加以下内容：

```json
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://mirror.ccs.tencentyun.com",
    "https://registry.docker-cn.com"
  ]
}
```

### 步骤3：保存并重启

点击 "Apply & Restart"，等待Docker重启。

### 步骤4：重新部署

```powershell
cd e:\桌面\oj
docker compose up -d --build
```

---

## 方案三：直接使用国内镜像（绕过配置）

我已经更新了 `docker-compose.yml`，直接使用中科大镜像源：

```yaml
services:
  mongo:
    image: docker.mirrors.ustc.edu.cn/library/mongo:7
  redis:
    image: docker.mirrors.ustc.edu.cn/library/redis:7-alpine
  nginx:
    image: docker.mirrors.ustc.edu.cn/library/nginx:1.25-alpine
```

直接运行：

```powershell
cd e:\桌面\oj
docker compose up -d --build
```

---

## 验证部署成功

### 检查服务状态

```powershell
docker compose -f e:\桌面\oj\docker-compose.yml ps
```

**预期输出：**

```
NAME       IMAGE                              STATUS          PORTS
oj-app-1   oj-platform:app                   running         0.0.0.0:3000->3000/tcp
oj-mongo-1 docker.mirrors.ustc.edu.cn/...    running         0.0.0.0:27017->27017/tcp
oj-redis-1 docker.mirrors.ustc.edu.cn/...    running         0.0.0.0:6379->6379/tcp
oj-nginx-1 docker.mirrors.ustc.edu.cn/...    running         0.0.0.0:8080->80/tcp
```

### 测试API

```powershell
# 测试健康检查
Invoke-WebRequest -Uri "http://localhost:3000/api/health/db" -Method GET

# 应该返回 JSON 数据
```

### 查看日志

```powershell
# 查看所有服务日志
docker compose -f e:\桌面\oj\docker-compose.yml logs -f

# 只看应用日志
docker compose -f e:\桌面\oj\docker-compose.yml logs -f app
```

---

## 访问服务

部署成功后，您可以通过以下地址访问：

| 服务 | 地址 | 说明 |
|------|------|------|
| 应用主页 | http://localhost:3000 | OJ平台主页面 |
| Nginx HTTP | http://localhost:8080 | 静态资源代理 |
| Nginx HTTPS | https://localhost:8443 | SSL加密（需配置证书） |
| MongoDB | localhost:27017 | 数据库（仅内部） |
| Redis | localhost:6379 | 缓存（仅内部） |

### 默认账号

```
管理员账号: admin
管理员密码: admin123
测试账号: user1 ~ user10
测试密码: user123
```

---

## 故障排除

### 问题1：镜像拉取超时

**症状：** `context deadline exceeded`

**解决方案：**

```powershell
# 清理Docker缓存
docker system prune -a --volumes

# 重新拉取镜像
docker compose -f e:\桌面\oj\docker-compose.yml pull

# 再次构建
docker compose -f e:\桌面\oj\docker-compose.yml up -d --build
```

### 问题2：端口被占用

**症状：** `port is already allocated`

**解决方案：**

```powershell
# 查看端口占用
netstat -ano | Select-String ":3000|:27017|:6379|:8080"

# 关闭占用的程序，或修改 docker-compose.yml 中的端口映射
```

### 问题3：构建失败

**症状：** `npm ci failed`

**解决方案：**

```powershell
# 重新安装依赖
docker compose -f e:\桌面\oj\docker-compose.yml build --no-cache app

# 或者删除 node_modules 后重新构建
Remove-Item -Path "e:\桌面\oj\node_modules" -Recurse -Force
docker compose -f e:\桌面\oj\docker-compose.yml up -d --build
```

### 问题4：数据库初始化失败

**症状：** `MongoDB ReplicaSet not initialized`

**解决方案：**

```powershell
# 进入MongoDB容器
docker exec -it oj-mongo-1 mongosh

# 手动初始化副本集
rs.initiate({_id:"rs0",members:[{_id:0,host:"localhost:27017"}]})
rs.status()
```

---

## 常用命令

```powershell
# 启动服务
docker compose -f e:\桌面\oj\docker-compose.yml up -d

# 停止服务
docker compose -f e:\桌面\oj\docker-compose.yml down

# 完全重建（删除所有数据）
docker compose -f e:\桌面\oj\docker-compose.yml down -v
docker compose -f e:\桌面\oj\docker-compose.yml up -d --build

# 查看服务状态
docker compose -f e:\桌面\oj\docker-compose.yml ps

# 查看日志
docker compose -f e:\桌面\oj\docker-compose.yml logs -f

# 进入容器
docker exec -it oj-app-1 sh
docker exec -it oj-mongo-1 mongosh
docker exec -it oj-redis-1 redis-cli

# 重启服务
docker compose -f e:\桌面\oj\docker-compose.yml restart app

# 查看资源使用
docker stats
```

---

## 快速参考卡

| 操作 | 命令 |
|------|------|
| 首次部署 | `docker compose -f e:\桌面\oj\docker-compose.yml up -d --build` |
| 查看状态 | `docker compose -f e:\桌面\oj\docker-compose.yml ps` |
| 查看日志 | `docker compose -f e:\桌面\oj\docker-compose.yml logs -f` |
| 重启服务 | `docker compose -f e:\桌面\oj\docker-compose.yml restart` |
| 完全重建 | `docker compose -f e:\桌面\oj\docker-compose.yml down -v && docker compose -f e:\桌面\oj\docker-compose.yml up -d --build` |
| 访问主页 | http://localhost:3000 |

---

## 技术支持

如果遇到问题：

1. **检查Docker Desktop是否运行**：Docker图标是否为绿色
2. **查看错误日志**：`docker compose logs`
3. **验证网络连接**：`ping docker.mirrors.ustc.edu.cn`
4. **联系支持**：提供完整的错误信息

祝您部署成功！🎉