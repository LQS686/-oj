# Docker镜像加速器一键配置脚本
# 使用轩辕镜像：https://docker.xuanyuan.me

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Docker 镜像加速器配置工具" -ForegroundColor Cyan
Write-Host "使用镜像: docker.xuanyuan.me" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 获取Docker配置文件路径
$dockerDir = "$env:USERPROFILE\.docker"
$dockerConfigPath = "$dockerDir\daemon.json"

Write-Host "[1/4] 检查Docker Desktop状态..." -ForegroundColor Yellow

$dockerRunning = Get-Process -Name "Docker Desktop" -ErrorAction SilentlyContinue
if ($null -eq $dockerRunning) {
    Write-Host "⚠️  Docker Desktop未运行" -ForegroundColor Yellow
    Write-Host "请先启动Docker Desktop，然后按任意键继续..." -ForegroundColor Yellow
    Read-Host
} else {
    Write-Host "✅ Docker Desktop正在运行" -ForegroundColor Green
}

Write-Host ""
Write-Host "[2/4] 创建Docker配置目录..." -ForegroundColor Yellow

if (-not (Test-Path $dockerDir)) {
    New-Item -ItemType Directory -Path $dockerDir -Force | Out-Null
    Write-Host "✅ 目录创建成功" -ForegroundColor Green
} else {
    Write-Host "✅ 目录已存在" -ForegroundColor Green
}

# 备份现有配置
if (Test-Path $dockerConfigPath) {
    $backupPath = "$dockerConfigPath.backup.$(Get-Date -Format 'yyyyMMddHHmmss').json"
    Copy-Item $dockerConfigPath $backupPath -Force
    Write-Host "✅ 已备份现有配置到: $backupPath" -ForegroundColor Green
}

Write-Host ""
Write-Host "[3/4] 配置轩辕镜像加速器..." -ForegroundColor Yellow

# 创建配置内容
$configContent = @"
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
"@

try {
    # 写入配置文件
    $configContent | Out-File -FilePath $dockerConfigPath -Encoding UTF8 -Force
    
    Write-Host "✅ 镜像加速器配置已写入" -ForegroundColor Green
    Write-Host ""
    Write-Host "配置内容:" -ForegroundColor Cyan
    Get-Content $dockerConfigPath | ForEach-Object { Write-Host "  $_" }
    
} catch {
    Write-Host "❌ 配置失败: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "手动配置方法:" -ForegroundColor Yellow
    Write-Host "1. 打开 Docker Desktop" -ForegroundColor White
    Write-Host "2. Settings → Resources → Docker Engine" -ForegroundColor White
    Write-Host "3. 在编辑器中添加以下内容:" -ForegroundColor White
    Write-Host '   { "registry-mirrors": ["https://docker.xuanyuan.me"] }' -ForegroundColor Gray
    Write-Host "4. 点击 Apply & Restart" -ForegroundColor White
    exit 1
}

Write-Host ""
Write-Host "[4/4] 重启Docker Desktop..." -ForegroundColor Yellow

# 提示用户手动重启
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "配置完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "⚠️  重要提示:" -ForegroundColor Yellow
Write-Host "请手动重启Docker Desktop使配置生效" -ForegroundColor White
Write-Host ""
Write-Host "重启后，请运行以下命令验证:" -ForegroundColor Cyan
Write-Host "  docker info | Select-String 'Registry Mirrors'" -ForegroundColor Gray
Write-Host ""
Write-Host "验证通过后，执行以下命令启动OJ平台:" -ForegroundColor Cyan
Write-Host "  docker compose -f e:\桌面\oj\docker-compose.yml up -d --build" -ForegroundColor Green
Write-Host ""

# 测试镜像连通性
Write-Host "测试镜像源连通性..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "https://docker.xuanyuan.me" -Method HEAD -TimeoutSec 5 -ErrorAction Stop
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ 镜像源连通性测试通过" -ForegroundColor Green
    } else {
        Write-Host "⚠️  镜像源返回状态码: $($response.StatusCode)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️  镜像源连通性测试失败: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "请检查网络代理设置或稍后重试" -ForegroundColor White
}

Write-Host ""
Write-Host "按任意键退出..." -ForegroundColor Gray
Read-Host