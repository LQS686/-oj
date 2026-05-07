# 阿里云Docker登录与镜像加速配置指南

## 问题诊断

您遇到了以下错误：

```
Error response from daemon: pull access denied for registry.cn-hangzhou.aliyuncs.com/mirrors/nginx, 
repository does not exist or may require 'docker login'
```

**原因**：阿里云容器镜像服务的公开镜像需要登录才能拉取。

---

## 解决方案

### 方案1：登录阿里云Docker Registry（推荐）

#### 步骤1：登录阿里云

在终端中执行：

```powershell
docker login registry.cn-hangzhou.aliyuncs.com
```

系统会提示输入用户名和密码：
- **用户名**：您的阿里云账号
- **密码**：您的阿里云账号密码或AccessKey

#### 步骤2：重新部署

登录成功后，执行：

```powershell
cd e:\桌面\oj
docker compose up -d --build
```

---

### 方案2：使用阿里云加速器地址（无需登录）

如果您有阿里云加速器地址，可以使用以下配置：

#### 获取加速器地址

1. 访问 https://cr.console.aliyun.com
2. 登录后进入"容器镜像服务"
3. 选择"镜像加速器"
4. 复制您的专属加速器地址（格式如：`https://xxxx.mirror.aliyuncs.com`）

#### 更新Docker配置

将加速器地址添加到Docker Desktop：

1. 打开Docker Desktop → Settings → Resources → Docker Engine
2. 添加以下配置：

```json
{
  "registry-mirrors": [
    "https://您的加速器地址"
  ]
}
```

3. 点击 Apply & Restart

#### 重新部署

```powershell
cd e:\桌面\oj
docker compose down
docker compose up -d --build
```

---

### 方案3：使用本地开发模式（推荐作为备选）

如果阿里云登录仍然有问题，可以使用本地开发模式，不依赖Docker：

#### 步骤1：确保MongoDB和Redis可用

您可以选择：

**选项A：使用已有Docker服务**

```powershell
# 只启动MongoDB和Redis（不拉取镜像，使用本地已有的）
docker run -d --name mongo -p 27017:27017 mongo:7
docker run -d --name redis -p 6379:6379 redis:7-alpine
```

**选项B：本地安装**

安装本地MongoDB和Redis服务

#### 步骤2：安装依赖

```powershell
cd e:\桌面\oj
npm install
```

#### 步骤3：启动应用

```powershell
npm run dev
```

应用将在 **http://localhost:3000** 运行

---

### 方案4：跳过基础镜像拉取（如果本地已有）

如果您本地已有这些镜像，可以跳过拉取：

```powershell
# 检查本地镜像
docker images

# 如果已有，可以直接启动
docker compose up -d
```

---

## 快速检查清单

请执行以下命令检查：

```powershell
# 1. 检查Docker状态
docker info | Select-String "Username|Registry"

# 2. 尝试登录阿里云
docker login registry.cn-hangzhou.aliyuncs.com

# 3. 如果登录失败，使用本地模式
npm run dev
```

---

## 技术支持

如果遇到问题，请提供：

1. `docker login` 的输出结果
2. `docker info` 中关于Registry的部分
3. 网络环境描述（公司网络/家庭网络/代理）

---

## 总结

**最简单的解决方案**：
1. 运行 `docker login registry.cn-hangzhou.aliyuncs.com`
2. 输入阿里云用户名和密码
3. 运行 `docker compose up -d --build`

**如果登录失败**：
直接使用本地模式：`npm run dev`

告诉我您执行 `docker login` 的结果，我可以进一步帮助您！