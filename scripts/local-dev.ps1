# OJ平台本地开发启动脚本
# 适用于本地有Node.js、MongoDB和Redis的环境

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "OJ平台本地开发模式" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$ErrorActionPreference = "Stop"

# 检查Node.js
Write-Host "检查环境..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js未安装" -ForegroundColor Red
    exit 1
}

# 检查MongoDB连接
Write-Host ""
Write-Host "检查MongoDB连接..." -ForegroundColor Yellow
try {
    $mongoTest = Test-NetConnection -ComputerName localhost -Port 27017 -WarningAction SilentlyContinue
    if ($mongoTest.TcpTestSucceeded) {
        Write-Host "✅ MongoDB: 已连接" -ForegroundColor Green
    } else {
        Write-Host "⚠️  MongoDB: 未检测到 (localhost:27017)" -ForegroundColor Yellow
        Write-Host "  提示: 请启动MongoDB或使用Docker" -ForegroundColor Gray
    }
} catch {
    Write-Host "⚠️  MongoDB: 检查失败" -ForegroundColor Yellow
}

# 检查Redis连接
Write-Host ""
Write-Host "检查Redis连接..." -ForegroundColor Yellow
try {
    $redisTest = Test-NetConnection -ComputerName localhost -Port 6379 -WarningAction SilentlyContinue
    if ($redisTest.TcpTestSucceeded) {
        Write-Host "✅ Redis: 已连接" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Redis: 未检测到 (localhost:6379)" -ForegroundColor Yellow
        Write-Host "  提示: 请启动Redis或使用Docker" -ForegroundColor Gray
    }
} catch {
    Write-Host "⚠️  Redis: 检查失败" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "安装依赖" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 安装依赖
Write-Host ""
Write-Host "运行 npm install..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ npm install 失败" -ForegroundColor Red
    exit 1
}
Write-Host "✅ npm install 完成" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "启动开发服务器" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Write-Host ""
Write-Host "运行 npm run dev..." -ForegroundColor Yellow
Write-Host ""
Write-Host "应用将在 http://localhost:3000 启动" -ForegroundColor Cyan
Write-Host "按 Ctrl+C 停止服务" -ForegroundColor Gray
Write-Host ""

# 启动开发服务器
npm run dev