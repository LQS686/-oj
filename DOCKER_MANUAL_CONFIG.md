# Docker镜像加速器手动配置指南

## 问题原因

您的Docker Desktop无法访问Docker Hub，导致Dockerfile中的`node:20-alpine`镜像无法拉取。

## 解决方案

### 步骤1：手动配置Docker镜像加速器

由于权限限制，请手动完成以下步骤：

1. **打开Docker Desktop设置**
   - 右键点击系统托盘的Docker图标
   - 选择 **Settings**

2. **进入Docker Engine配置**
   - 点击 **Resources**
   - 点击 **Docker Engine**

3. **编辑配置**
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

4. **点击 Apply & Restart**

5. **等待Docker Desktop完全重启**（约30秒）

---

### 步骤2：拉取Node镜像（如果上一步配置成功）

重启后，打开PowerShell执行：

```powershell
docker pull docker.xuanyuan.me/library/node:20-alpine
```

这应该能成功拉取（约300MB，需要2-5分钟）。

---

### 步骤3：重新构建应用

```powershell
cd e:\桌面\oj
docker compose -f e:\桌面\oj\docker-compose.yml build --no-cache
docker compose -f e:\桌面\oj\docker-compose.yml up -d
```

---

## 备选方案：如果Docker镜像加速器配置仍然失败

由于您的网络环境限制，可以尝试以下方案：

### 方案A：手动拉取所有基础镜像

先手动拉取所有需要的镜像：

```powershell
docker pull docker.xuanyuan.me/library/node:20-alpine
docker pull docker.xuanyuan.me/library/mongo:7
docker pull docker.xuanyuan.me/library/redis:7-alpine
docker pull docker.xuanyuan.me/library/nginx:1.25-alpine
```

然后修改`docker-compose.yml`，将所有镜像源改为`docker.xuanyuan.me/library/`。

### 方案B：使用本地构建模式

如果不依赖Docker构建，可以直接在本地构建：

```powershell
cd e:\桌面\oj
npm install
npm run build
npm run dev
```

这将绕过Docker，直接在本地运行应用。

---

## 快速检查清单

请确认以下步骤已完成：

- [ ] Docker Desktop已重启
- [ ] registry-mirrors配置已添加
- [ ] Node镜像已成功拉取
- [ ] 应用构建成功

---

## 技术支持

如果遇到问题，请运行诊断脚本：

```powershell
powershell -ExecutionPolicy Bypass -File "e:\桌面\oj\scripts\diagnose-docker.ps1"
```

---

## 当前进度

- ✅ Redis镜像：已拉取
- ✅ MongoDB镜像：已拉取
- ✅ Nginx镜像：已拉取
- ⏳ Node镜像：正在拉取中...
- ⏳ 应用构建：等待中

请完成Docker镜像加速器配置后，告诉我结果，我将帮您继续！