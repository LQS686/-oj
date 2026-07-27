#Requires -Version 5.1
<#
.SYNOPSIS
  Sync repo into WSL ~/dsoj and run npm run dev there (Linux judge only).
  Windows host judging is unsupported — this script only bridges editor → WSL.
#>
param(
    [switch]$Full,
    [switch]$SyncOnly,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Fail([string]$Message) {
    Write-Host "!! $Message" -ForegroundColor Red
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$innerScriptWin = Join-Path $repoRoot "scripts\wsl-dev.sh"

if (-not (Test-Path $innerScriptWin)) {
    Write-Fail "Missing scripts\wsl-dev.sh"
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " DSOJ WSL sync + start" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Windows src: $repoRoot"
Write-Host ""

try {
    $null = & wsl -e echo ok 2>$null
    if ($LASTEXITCODE -ne 0) { throw "wsl failed" }
} catch {
    Write-Fail "WSL not available. Install Ubuntu first: wsl --install"
    exit 1
}

# Chinese paths break when passed as raw argv to wsl.exe.
# WSLENV /p translates the Windows path into a Linux path inside WSL.
$env:DSOJ_WIN_ROOT = $repoRoot
if ($env:WSLENV) {
    if ($env:WSLENV -notmatch '(^|:)DSOJ_WIN_ROOT(/p)?(:|$)') {
        $env:WSLENV = $env:WSLENV.TrimEnd(':') + ":DSOJ_WIN_ROOT/p"
    } elseif ($env:WSLENV -notmatch 'DSOJ_WIN_ROOT/p') {
        $env:WSLENV = $env:WSLENV -replace 'DSOJ_WIN_ROOT', 'DSOJ_WIN_ROOT/p'
    }
} else {
    $env:WSLENV = "DSOJ_WIN_ROOT/p"
}

$extraFlags = @()
if ($Full) { $extraFlags += "--full" }
if ($SyncOnly) { $extraFlags += "--sync-only" }
$flagStr = ($extraFlags -join " ").Trim()

if (-not $SyncOnly -and -not $NoBrowser) {
    Start-Job -ScriptBlock {
        Start-Sleep -Seconds 8
        try {
            Start-Process "http://localhost:3000"
        } catch { }
    } | Out-Null
}

Write-Step "WSL: sync and start..."
Write-Host " Tip: Ctrl+C stops the dev server" -ForegroundColor Gray
Write-Host ""

# Build remote command without embedding Chinese paths (use env var only).
$remote = "set -euo pipefail; ROOT=`"`$DSOJ_WIN_ROOT`"; " +
    "if [ -z `"`$ROOT`" ] || [ ! -f `"`$ROOT/scripts/wsl-dev.sh`" ]; then " +
    "echo '!! DSOJ_WIN_ROOT invalid' >&2; exit 1; fi; " +
    "chmod +x `"`$ROOT/scripts/wsl-dev.sh`"; " +
    "exec bash `"`$ROOT/scripts/wsl-dev.sh`" --src `"`$ROOT`""
if ($flagStr) {
    $remote = $remote + " " + $flagStr
}

& wsl -e bash -lc $remote
$exitCode = $LASTEXITCODE

if ($SyncOnly) {
    if ($exitCode -eq 0) {
        Write-Host ""
        Write-Host "Sync done. To start: .\scripts\wsl-dev.ps1" -ForegroundColor Green
    }
    exit $exitCode
}

exit $exitCode
