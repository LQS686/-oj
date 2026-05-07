# Docker 部署最终解决方案

## 问题诊断

您的Docker Desktop无法访问Docker Hub，导致：
1. ✅ Redis镜像：已拉取（docker.xuanyuan.me）
2. ✅ MongoDB镜像：已拉取（docker.1ms.run）
3. ✅ Nginx镜像：已拉取（docker.1ms.run）
4. ❌ Node镜像：拉取失败

## 解决方案

### 方案A：配置Docker镜像加速器（推荐）

由于工具权限限制，请您**手动完成以下步骤**：

#### 步骤1：打开Docker Desktop设置

1. 右键点击系统托盘的Docker图标
2. 选择 **Settings**

#### 步骤2：进入Docker Engine配置

1. 点击 **Resources**
2. 点击 **Docker Engine**

#### 步骤3：编辑配置

在编辑器中找到 `"experimental": false` 这一行，在它**前面**添加：

```json
"registry-mirrors": [
  "https://docker.xuanyuan.me"
],
```

**完整配置应该看起来像这样：**

```json
{
  "registry-mirrors": [
    "https://docker.xuanyuan.me"
  ],
  "builder": {
    "gc": {
      "enabled": true,
      "defaultKeepStorage": "20GB"
    }
  },
  "experimental": false,
  "features": {
    "buildkit": true
  }
}
```

#### 步骤4：点击 Apply & Restart

#### 步骤5：等待Docker Desktop完全重启

约30秒，确保图标变为绿色。

---

### 方案B：使用本地开发模式（绕过Docker）

如果不依赖Docker构建，可以直接在本地运行：

```powershell
cd e:\桌面\oj

# 安装依赖
npm install

# 构建应用
npm run build

# 启动应用
npm run dev
```

这将绕过Docker，直接在本地运行应用。

**要求**：
- 本地MongoDB运行在localhost:27017
- 本地Redis运行在localhost:6379

---

## 完整部署步骤（配置镜像加速器后）

### 步骤1：重启Docker Desktop后

执行：

```powershell
cd e:\桌面\oj

# 拉取所有基础镜像
docker pull docker.xuanyuan.me/library/node:20-alpine
docker pull docker.xuanyuan.me/library/mongo:7
docker pull docker.xuanyuan.me/library/redis:7-alpine
docker pull docker.xuanyuan.me/library/nginx:1.25-alpine
```

### 步骤2：构建并启动应用

```powershell
cd e:\桌面\oj
docker compose up -d --build
```

### 步骤3：验证部署

```powershell
# 查看服务状态
docker compose -f e:\桌面\oj\docker-compose.yml ps

# 测试API
Invoke-WebRequest -Uri "http://localhost:3000" -Method GET
```

---

## 当前可用的镜像

| 服务 | 镜像源 | 状态 | 大小 |
|------|--------|------|------|
| Redis | docker.xuanyuan.me/library/redis:7-alpine | ✅ 已拉取 | 61.2MB |
| MongoDB | docker.1ms.run/library/mongo:7 | ✅ 已拉取 | 1.19GB |
| Nginx | docker.1ms.run/library/nginx:1.25-alpine | ✅ 已拉取 | 75.4MB |
| Node | docker.xuanyuan.me/library/node:20-alpine | ❌ 需拉取 | ~300MB |

---

## 快速参考

### 查看镜像列表
```powershell
docker images
```

### 查看服务状态
```powershell
docker compose -f e:\桌面\oj\docker-compose.yml ps
```

### 查看日志
```powershell
docker compose -f e:\桌面\oj\docker-compose.yml logs -f
```

### 停止所有服务
```powershell
docker compose -f e:\桌面\oj\docker-compose.yml down
```

---

## 联系支持

如果遇到问题，请提供：
1. Docker Desktop状态（是否运行）
2. 错误信息截图
3. `docker info` 的输出

我将根据您的具体情况提供进一步的帮助！