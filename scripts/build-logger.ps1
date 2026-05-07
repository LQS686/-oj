# 构建日志查看器
$ErrorActionPreference = "Continue"

Write-Host "开始构建OJ平台镜像..." -ForegroundColor Cyan
Write-Host ""

$buildProcess = Start-Process -FilePath "docker" -ArgumentList "build", "-t", "oj-platform:app", "-f", "Dockerfile", "." -NoNewWindow -Wait -PassThru -RedirectStandardOutput "$env:TEMP\docker_build_output.log" -RedirectStandardError "$env:TEMP\docker_build_error.log"

Write-Host ""
Write-Host "构建退出码: $($buildProcess.ExitCode)" -ForegroundColor $(if ($buildProcess.ExitCode -eq 0) { "Green" } else { "Red" })

Write-Host ""
Write-Host "=== 标准输出 ===" -ForegroundColor Cyan
if (Test-Path "$env:TEMP\docker_build_output.log") {
    Get-Content "$env:TEMP\docker_build_output.log" | Select-Object -Last 100
} else {
    Write-Host "无输出文件" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== 错误输出 ===" -ForegroundColor Red
if (Test-Path "$env:TEMP\docker_build_error.log") {
    $errorContent = Get-Content "$env:TEMP\docker_build_error.log"
    if ($errorContent) {
        $errorContent | Select-Object -Last 50
    } else {
        Write-Host "无错误" -ForegroundColor Green
    }
} else {
    Write-Host "无错误文件" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== 检查镜像 ===" -ForegroundColor Cyan
docker images | Select-String "oj-platform"

Write-Host ""
if ($buildProcess.ExitCode -eq 0) {
    Write-Host "✅ 构建成功！" -ForegroundColor Green
} else {
    Write-Host "❌ 构建失败" -ForegroundColor Red
}

Write-Host ""
Write-Host "按任意键退出..."
Read-Host