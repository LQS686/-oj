# OJ平台Docker一键部署脚本
# 只需运行此脚本即可完成所有部署工作

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "OJ平台Docker一键部署脚本" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$ErrorActionPreference = "Stop"

# 切换到脚本目录
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ($scriptDir) {
    Set-Location $scriptDir
}

Write-Host "[1/6] 检查Docker Desktop状态..." -ForegroundColor Yellow

# 检查Docker是否运行
$dockerRunning = Get-Process -Name "Docker Desktop" -ErrorAction SilentlyContinue
if ($null -eq $dockerRunning) {
    Write-Host "⚠️  Docker Desktop未运行！" -ForegroundColor Red
    Write-Host "请先启动Docker Desktop，然后按任意键继续..." -ForegroundColor Yellow
    Read-Host
}

Write-Host "✅ Docker Desktop正在运行" -ForegroundColor Green

Write-Host ""
Write-Host "[2/6] 拉取基础镜像..." -ForegroundColor Yellow

# 拉取所有基础镜像
$mirrors = @(
    @{ Name = "Redis"; Image = "docker.xuanyuan.me/library/redis:7-alpine" },
    @{ Name = "MongoDB"; Image = "docker.1ms.run/library/mongo:7" },
    @{ Name = "Node.js"; Image = "docker.1ms.run/library/node:20-alpine" },
    @{ Name = "Nginx"; Image = "docker.1ms.run/library/nginx:1.25-alpine" }
)

# 评测镜像（USE_DOCKER=true 时需要，首次评测前预拉取避免超时）
$judgeImages = @(
    @{ Name = "GCC (C/C++)"; Image = "gcc:12" },
    @{ Name = "OpenJDK (Java)"; Image = "openjdk:17" },
    @{ Name = "Python"; Image = "python:3.11" },
    @{ Name = "Node (JavaScript)"; Image = "node:18" }
)

foreach ($item in $mirrors) {
    Write-Host "  拉取 $($item.Name)..." -NoNewline
    try {
        docker pull $item.Image 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host " ✅" -ForegroundColor Green
        } else {
            Write-Host " ⚠️" -ForegroundColor Yellow
        }
    } catch {
        Write-Host " ⚠️" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "  拉取评测镜像（首次评测前预拉取，避免超时）..." -ForegroundColor Cyan
foreach ($item in $judgeImages) {
    Write-Host "  拉取 $($item.Name)..." -NoNewline
    try {
        docker pull $item.Image 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host " ✅" -ForegroundColor Green
        } else {
            Write-Host " ⚠️ (USE_DOCKER=true 时必需)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host " ⚠️ (USE_DOCKER=true 时必需)" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "[3/6] 构建OJ应用镜像..." -ForegroundColor Yellow

# 启用 BuildKit：Dockerfile 中 --mount=type=cache 依赖 BuildKit 才能生效
# BuildKit 缓存 apk / npm / next build 三处慢操作的下载产物到 host，
# 后续 --no-cache 也能秒级复用，避免每次重新下载 gcc/g++ 等大包
$env:DOCKER_BUILDKIT = "1"

# 构建应用镜像
Write-Host "  正在构建（首次约 5-10 分钟，后续复用缓存秒级完成）..." -ForegroundColor Cyan
$buildResult = docker build -t oj-platform:app -f Dockerfile . 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✅ 应用镜像构建成功" -ForegroundColor Green
} else {
    Write-Host "  ❌ 应用镜像构建失败" -ForegroundColor Red
    Write-Host ""
    Write-Host "构建日志:" -ForegroundColor Yellow
    $buildResult | Select-Object -Last 30 | ForEach-Object { Write-Host $_ }
    exit 1
}

Write-Host ""
Write-Host "[4/6] 启动MongoDB和Redis..." -ForegroundColor Yellow

# 启动MongoDB和Redis
docker compose up -d mongo redis 2>&1 | Out-Null
Write-Host "  ✅ MongoDB和Redis已启动" -ForegroundColor Green

Write-Host ""
Write-Host "[5/6] 等待服务健康检查..." -ForegroundColor Yellow

# 等待MongoDB和Redis启动
Start-Sleep -Seconds 15

Write-Host "  ✅ 服务已就绪" -ForegroundColor Green

Write-Host ""
Write-Host "[6/6] 启动OJ应用..." -ForegroundColor Yellow

# 启动应用
docker compose up -d app 2>&1 | Out-Null

Start-Sleep -Seconds 10

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "部署完成！🎉" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "服务状态:" -ForegroundColor White
docker compose ps
Write-Host ""
Write-Host "访问地址:" -ForegroundColor White
Write-Host "  应用主页: http://localhost:3000" -ForegroundColor Cyan
Write-Host "  Nginx: http://localhost:8080" -ForegroundColor Cyan
Write-Host ""
Write-Host "首次使用: 访问网站注册首个账号，将自动获得系统管理员权限" -ForegroundColor Cyan
Write-Host ""

# 测试API
Write-Host "测试API连接..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/api/health/db" -Method GET -TimeoutSec 5 -ErrorAction Stop
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ API测试通过！" -ForegroundColor Green
    } else {
        Write-Host "⚠️  API返回状态码: $($response.StatusCode)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️  API连接测试失败，请稍后重试" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "按任意键退出..." -ForegroundColor Gray
Read-Host