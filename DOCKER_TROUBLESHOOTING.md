# Docker 部署问题诊断与解决方案

## 问题描述

在执行 `docker compose up -d --build` 时出现以下错误：

```
Error response from daemon: failed to resolve reference "docker.io/library/mongo:7": 
failed to do request: Head "https://registry-1.docker.io/v2/library/mongo/manifests/7": 
dialing registry-1.docker.io:443 container via direct connection because 
Docker Desktop has no HTTPS proxy: connecting to registry-1.docker.io:443: 
dial tcp 65.49.26.97:443: connectex: A connection attempt failed because 
the connected party did not properly respond after a period of time, 
or established connection failed because connected host has failed to respond.
```

## 原因分析

1. **网络问题**：Docker Desktop配置的HTTP代理无法正常连接到Docker Hub
2. **代理设置**：当前使用 `http.docker.internal:3128` 作为代理
3. **镜像源限制**：Docker Hub在中国大陆访问受限

## 解决方案

### 方案1：使用国内镜像加速器（推荐）

我已经更新了 `docker-compose.yml`，将所有镜像改为使用 Google Container Registry 的镜像源：

```yaml
services:
  mongo:
    image: mirror.gcr.io/library/mongo:7
  redis:
    image: mirror.gcr.io/library/redis:7-alpine
  nginx:
    image: mirror.gcr.io/library/nginx:1.25-alpine
```

### 方案2：配置Docker镜像加速器

如果方案1仍然有问题，可以配置阿里云镜像加速器：

1. 打开 Docker Desktop 设置
2. 进入 Resources → Docker Engine
3. 添加以下配置：

```json
{
  "registry-mirrors": [
    "https://mirror.ccs.tencentyun.com",
    "https://docker.mirrors.ustc.edu.cn",
    "https://registry.docker-cn.com"
  ]
}
```

4. 点击 Apply & Restart

### 方案3：手动拉取镜像

在执行 docker-compose 之前，先手动拉取镜像：

```powershell
docker pull mirror.gcr.io/library/mongo:7
docker pull mirror.gcr.io/library/redis:7-alpine
docker pull mirror.gcr.io/library/nginx:1.25-alpine
```

### 方案4：使用代理白名单

如果公司网络需要代理，需要将Docker Hub加入白名单：

1. 打开 Docker Desktop 设置
2. 进入 Resources → Proxies
3. 在 "Bypass for" 中添加：
   - `registry-1.docker.io`
   - `docker.io`

## 重新部署命令

```powershell
# 先停止现有容器
docker compose -f e:\桌面\oj\docker-compose.yml down

# 重新构建并启动（使用国内镜像）
docker compose -f e:\桌面\oj\docker-compose.yml up -d --build
```

## 验证部署状态

```powershell
# 查看服务状态
docker compose -f e:\桌面\oj\docker-compose.yml ps

# 查看日志
docker compose -f e:\桌面\oj\docker-compose.yml logs -f

# 查看镜像列表
docker images | Select-String -Pattern "mongo|redis|nginx|oj-platform"
```

## 注意事项

1. **首次部署较慢**：因为需要拉取所有基础镜像和构建应用
2. **网络要求**：确保能够访问 mirror.gcr.io 或配置了可用的镜像加速器
3. **端口占用**：确保以下端口未被占用：
   - 3000 (app)
   - 27017 (mongo)
   - 6379 (redis)
   - 8080 (nginx http)
   - 8443 (nginx https)

## 故障排除

如果仍然无法拉取镜像，可以尝试：

1. **检查网络连接**：
   ```powershell
   ping mirror.gcr.io
   ```

2. **测试代理设置**：
   ```powershell
   docker info | Select-String "HTTP Proxy|HTTPS Proxy"
   ```

3. **使用其他镜像源**：
   - 阿里云: `registry.cn-hangzhou.aliyuncs.com/library/`
   - 中科大: `docker.mirrors.ustc.edu.cn/`
   - 上海交大: `docker.shuosc.org/`

4. **清理Docker缓存**：
   ```powershell
   docker system prune -a
   ```

## 技术支持

如果以上方案都无法解决问题，请提供：

1. `docker info` 的完整输出
2. 网络环境描述（公司网络/家庭网络/代理）
3. 错误日志的完整信息