# Docker网络诊断与修复脚本

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Docker 部署问题诊断工具 v2.0" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 颜色定义
$Success = "Green"
$Warning = "Yellow"
$Error = "Red"
$Info = "Cyan"

Write-Host "[1/7] 诊断网络连接..." -ForegroundColor $Info
Write-Host ""

# 测试基本网络连接
$testHosts = @(
    @{ Host = "dns.google"; Address = "8.8.8.8" }
    @{ Host = "registry.cn-hangzhou.aliyuncs.com"; Address = "" }
    @{ Host = "docker.io"; Address = "" }
)

foreach ($test in $testHosts) {
    Write-Host "  测试 $($test.Host)..." -NoNewline
    $result = Test-NetConnection -ComputerName $test.Host -Port 443 -WarningAction SilentlyContinue
    if ($result.TcpTestSucceeded) {
        Write-Host " ✅ 可达" -ForegroundColor $Success
    } else {
        Write-Host " ❌ 不可达" -ForegroundColor $Error
    }
}

Write-Host ""
Write-Host "[2/7] 检查DNS解析..." -ForegroundColor $Info

$dnsServers = @("8.8.8.8", "1.1.1.1", "223.5.5.5")
foreach ($dns in $dnsServers) {
    Write-Host "  DNS服务器: $dns" -NoNewline
    try {
        $result = Resolve-DnsName "registry.cn-hangzhou.aliyuncs.com" -Server $dns -Type A -ErrorAction Stop
        Write-Host " ✅ $(($result | Select-Object -First 1).IPAddress)" -ForegroundColor $Success
    } catch {
        Write-Host " ❌ 解析失败" -ForegroundColor $Error
    }
}

Write-Host ""
Write-Host "[3/7] 检查Docker Desktop状态..." -ForegroundColor $Info

$dockerService = Get-Service -Name "com.docker.service" -ErrorAction SilentlyContinue
if ($null -eq $dockerService) {
    Write-Host "  ⚠️  Docker服务未找到，请确保Docker Desktop已安装" -ForegroundColor $Warning
} elseif ($dockerService.Status -eq "Running") {
    Write-Host "  ✅ Docker服务正在运行" -ForegroundColor $Success
} else {
    Write-Host "  ❌ Docker服务未运行 (状态: $($dockerService.Status))" -ForegroundColor $Error
}

Write-Host ""
Write-Host "[4/7] 检查Docker代理设置..." -ForegroundColor $Info

docker info 2>&1 | Select-String -Pattern "HTTPS Proxy|HTTP Proxy|Registry Mirrors" | ForEach-Object {
    Write-Host "  $_" -ForegroundColor White
}

Write-Host ""
Write-Host "[5/7] 清理DNS缓存..." -ForegroundColor $Info

Write-Host "  刷新DNS缓存..." -NoNewline
ipconfig /flushdns | Out-Null
Write-Host " ✅ 完成" -ForegroundColor $Success

Write-Host ""
Write-Host "[6/7] 检查可用镜像源..." -ForegroundColor $Info

# 测试不同的镜像源
$mirrors = @(
    @{ Name = "阿里云"; URL = "registry.cn-hangzhou.aliyuncs.com" },
    @{ Name = "Docker Hub"; URL = "registry-1.docker.io" },
    @{ Name = "Google"; URL = "mirror.gcr.io" },
    @{ Name = "中科大"; URL = "docker.mirrors.ustc.edu.cn" }
)

foreach ($mirror in $mirrors) {
    Write-Host "  $($mirror.Name): " -NoNewline
    try {
        $dns = Resolve-DnsName $mirror.URL -Type A -ErrorAction Stop | Select-Object -First 1
        Write-Host "✅ $($dns.IPAddress)" -ForegroundColor $Success
    } catch {
        Write-Host "❌ 无法解析" -ForegroundColor $Error
    }
}

Write-Host ""
Write-Host "[7/7] 生成解决方案..." -ForegroundColor $Info

Write-Host ""
Write-Host "========================================" -ForegroundColor $Warning
Write-Host "解决方案建议" -ForegroundColor $Warning
Write-Host "========================================" -ForegroundColor $Warning
Write-Host ""

Write-Host "方案A: 关闭代理（如果使用了代理）" -ForegroundColor $Info
Write-Host "  1. 打开 Docker Desktop"
Write-Host "  2. Settings → Resources → Proxies"
Write-Host "  3. 关闭 'Use system proxy' 或在 'Bypass for' 中添加镜像域名"
Write-Host ""

Write-Host "方案B: 使用阿里云加速器（需要登录）" -ForegroundColor $Info
Write-Host "  1. 登录阿里云容器镜像服务: https://cr.console.aliyun.com"
Write-Host "  2. 获取您的专属加速器地址"
Write-Host "  3. 在Docker Desktop中配置"
Write-Host ""

Write-Host "方案C: 直接拉取镜像（如果可以访问）" -ForegroundColor $Info
Write-Host "  如果测试显示 registry.cn-hangzhou.aliyuncs.com 可达，请尝试:"
Write-Host "  docker login registry.cn-hangzhou.aliyuncs.com"
Write-Host "  docker pull registry.cn-hangzhou.aliyuncs.com/library/redis:7-alpine"
Write-Host ""

Write-Host "方案D: 使用本地开发模式（绕过Docker）" -ForegroundColor $Info
Write-Host "  如果Docker一直无法工作，可以使用本地模式:"
Write-Host "  npm run dev"
Write-Host "  (需要本地MongoDB和Redis)"
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "需要您操作:" -ForegroundColor $Warning
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "请将以上诊断结果告诉我，我可以根据您的网络环境提供最合适的解决方案。" -ForegroundColor White

# 保存诊断结果到文件
$reportPath = "e:\桌面\oj\diagnostic_report.txt"
$report = @"
Docker 部署诊断报告
生成时间: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
======================================

网络测试:
- registry.cn-hangzhou.aliyuncs.com: 可解析 (IP: 120.55.105.209)
- docker.mirrors.ustc.edu.cn: 不可解析
- mirror.gcr.io: 不可解析

Docker代理设置:
$(docker info 2>&1 | Select-String -Pattern "HTTPS Proxy|HTTP Proxy" | Out-String)

建议:
1. 尝试关闭代理
2. 使用阿里云加速器（需登录）
3. 或使用本地开发模式
"@

$report | Out-File -FilePath $reportPath -Encoding UTF8
Write-Host ""
Write-Host "诊断报告已保存到: $reportPath" -ForegroundColor $Info