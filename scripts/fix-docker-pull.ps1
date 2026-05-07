# Docker镜像拉取问题修复脚本

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Docker 镜像拉取问题修复工具" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$ErrorActionPreference = "Continue"

Write-Host "[1/6] 停止所有Docker服务..." -ForegroundColor Yellow
docker compose -f "e:\桌面\oj\docker-compose.yml" down 2>&1 | Out-Null
docker stop (docker ps -aq) 2>&1 | Out-Null
Write-Host "✅ 已停止所有服务" -ForegroundColor Green

Write-Host ""
Write-Host "[2/6] 清理Docker镜像缓存..." -ForegroundColor Yellow

# 清理所有悬空镜像
$danglingImages = docker images -f "dangling=true" -q
if ($danglingImages) {
    Write-Host "  清理悬空镜像..." -NoNewline
    docker image prune -f | Out-Null
    Write-Host " ✅" -ForegroundColor Green
}

# 清理构建缓存
Write-Host "  清理构建缓存..." -NoNewline
docker builder prune -af | Out-Null
Write-Host " ✅" -ForegroundColor Green

Write-Host ""
Write-Host "[3/6] 重新拉取基础镜像..." -ForegroundColor Yellow

$mirrors = @(
    "docker.xuanyuan.me",
    "docker.1ms.run"
)

$success = $false

foreach ($mirror in $mirrors) {
    Write-Host ""
    Write-Host "尝试镜像源: $mirror" -ForegroundColor Cyan
    
    try {
        Write-Host "  拉取 Redis..." -NoNewline
        docker pull "${mirror}/library/redis:7-alpine" 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host " ✅" -ForegroundColor Green
            $success = $true
        } else {
            Write-Host " ❌" -ForegroundColor Red
        }
        
        if ($success) {
            Write-Host "  拉取 MongoDB..." -NoNewline
            docker pull "${mirror}/library/mongo:7" 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) {
                Write-Host " ✅" -ForegroundColor Green
            } else {
                Write-Host " ❌" -ForegroundColor Red
            }
            
            Write-Host "  拉取 Nginx..." -NoNewline
            docker pull "${mirror}/library/nginx:1.25-alpine" 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) {
                Write-Host " ✅" -ForegroundColor Green
            } else {
                Write-Host " ❌" -ForegroundColor Red
            }
        }
        
        if ($success) {
            break
        }
    } catch {
        Write-Host " ❌ $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "[4/6] 检查拉取的镜像..." -ForegroundColor Yellow

docker images | Select-String -Pattern "redis|mongo|nginx" | ForEach-Object {
    Write-Host "  $_" -ForegroundColor White
}

Write-Host ""
Write-Host "[5/6] 清理DNS缓存..." -ForegroundColor Yellow
ipconfig /flushdns | Out-Null
Write-Host "✅ DNS缓存已清理" -ForegroundColor Green

Write-Host ""
Write-Host "[6/6] 准备重新部署..." -ForegroundColor Yellow

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "解决方案" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if ($success) {
    Write-Host "✅ 镜像拉取成功！" -ForegroundColor Green
    Write-Host ""
    Write-Host "现在执行以下命令启动服务:" -ForegroundColor Cyan
    Write-Host "  cd e:\桌面\oj" -ForegroundColor White
    Write-Host "  docker compose up -d --build" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "⚠️  镜像拉取仍有问题" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "备选方案1：使用本地开发模式（不依赖Docker）" -ForegroundColor Cyan
    Write-Host "  npm run dev" -ForegroundColor White
    Write-Host ""
    Write-Host "备选方案2：手动拉取镜像后重试" -ForegroundColor Cyan
    Write-Host "  docker pull redis:7-alpine" -ForegroundColor White
    Write-Host "  docker pull mongo:7" -ForegroundColor White
    Write-Host "  docker pull nginx:1.25-alpine" -ForegroundColor White
    Write-Host ""
    Write-Host "备选方案3：检查Docker Desktop代理设置" -ForegroundColor Cyan
    Write-Host "  打开 Docker Desktop → Settings → Resources → Proxies" -ForegroundColor White
    Write-Host "  确保没有启用代理或已添加镜像域名到白名单" -ForegroundColor White
    Write-Host ""
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "快速检查命令" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. 查看Docker镜像:" -ForegroundColor White
Write-Host "   docker images" -ForegroundColor Gray
Write-Host ""
Write-Host "2. 查看服务状态:" -ForegroundColor White
Write-Host "   docker compose -f e:\桌面\oj\docker-compose.yml ps" -ForegroundColor Gray
Write-Host ""
Write-Host "3. 查看Docker代理设置:" -ForegroundColor White
Write-Host "   docker info | Select-String 'HTTP Proxy|HTTPS Proxy'" -ForegroundColor Gray
Write-Host ""
Write-Host "4. 测试网络连接:" -ForegroundColor White
Write-Host "   Test-NetConnection -ComputerName docker.xuanyuan.me -Port 443" -ForegroundColor Gray