# Docker镜像加速器配置脚本
# 解决Docker Desktop无法拉取镜像的问题

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Docker 镜像加速器配置工具" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查Docker Desktop是否运行
Write-Host "检查Docker Desktop状态..." -ForegroundColor Yellow
$dockerRunning = Get-Process -Name "Docker Desktop" -ErrorAction SilentlyContinue
if ($null -eq $dockerRunning) {
    Write-Host "⚠️  Docker Desktop未运行，正在尝试启动..." -ForegroundColor Yellow
    # 不自动启动Docker Desktop，避免权限问题
    Write-Host "请手动启动Docker Desktop后再运行此脚本" -ForegroundColor Red
    exit 1
} else {
    Write-Host "✅ Docker Desktop正在运行" -ForegroundColor Green
}

# 获取Docker配置文件路径
$dockerConfigPath = "$env:USERPROFILE\.docker\daemon.json"

Write-Host ""
Write-Host "当前Docker Engine配置路径: $dockerConfigPath" -ForegroundColor Cyan

# 创建备份
if (Test-Path $dockerConfigPath) {
    $backupPath = "$dockerConfigPath.backup.$(Get-Date -Format 'yyyyMMddHHmmss').json"
    Copy-Item $dockerConfigPath $backupPath -Force
    Write-Host "✅ 已备份当前配置到: $backupPath" -ForegroundColor Green
}

# 创建新的镜像加速器配置
$mirrorList = @(
    "https://docker.mirrors.ustc.edu.cn",
    "https://mirror.ccs.tencentyun.com",
    "https://registry.docker-cn.com"
)

$configContent = @"
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://mirror.ccs.tencentyun.com",
    "https://registry.docker-cn.com"
  ],
  "insecure-registries": [],
  "debug": false,
  "experimental": false,
  "features": {
    "buildkit": true
  }
}
"@

Write-Host ""
Write-Host "正在配置镜像加速器..." -ForegroundColor Yellow

try {
    # 创建.docker目录
    $dockerDir = Split-Path $dockerConfigPath -Parent
    if (-not (Test-Path $dockerDir)) {
        New-Item -ItemType Directory -Path $dockerDir -Force | Out-Null
    }

    # 写入配置
    $configContent | Out-File -FilePath $dockerConfigPath -Encoding UTF8 -Force
    
    Write-Host "✅ 镜像加速器配置已写入" -ForegroundColor Green
    Write-Host ""
    Write-Host "配置内容:" -ForegroundColor Cyan
    Get-Content $dockerConfigPath | Write-Host
    
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "配置完成！" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "⚠️  重要提示:" -ForegroundColor Yellow
    Write-Host "1. 请重启Docker Desktop以使配置生效" -ForegroundColor White
    Write-Host "2. 重启后，Docker将使用配置的镜像加速器" -ForegroundColor White
    Write-Host "3. 首次拉取镜像可能需要较长时间" -ForegroundColor White
    Write-Host ""
    Write-Host "重启Docker Desktop后，请运行以下命令:" -ForegroundColor Cyan
    Write-Host "  docker compose -f e:\桌面\oj\docker-compose.yml up -d --build" -ForegroundColor Green
    Write-Host ""
    
} catch {
    Write-Host "❌ 配置失败: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "手动配置方法:" -ForegroundColor Yellow
    Write-Host "1. 打开 Docker Desktop" -ForegroundColor White
    Write-Host "2. 进入 Settings → Resources → Docker Engine" -ForegroundColor White
    Write-Host "3. 在编辑器中添加以下内容:" -ForegroundColor White
    Write-Host '   { "registry-mirrors": ["https://docker.mirrors.ustc.edu.cn"] }' -ForegroundColor Gray
    Write-Host "4. 点击 Apply & Restart" -ForegroundColor White
}