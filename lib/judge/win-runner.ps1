# Windows judge runner fallback (prefer win-runner.exe).
# ASCII-only. Writes PeakWorkingSet (KB) + CPU time ms (GetProcessTimes).
param(
  [Parameter(Mandatory = $true)][string]$Executable,
  [string]$ArgumentList = '[]',
  [Parameter(Mandatory = $true)][string]$WorkingDirectory,
  [Parameter(Mandatory = $true)][string]$InputFile,
  [Parameter(Mandatory = $true)][string]$OutputFile,
  [Parameter(Mandatory = $true)][string]$ErrorFile,
  [Parameter(Mandatory = $true)][string]$MemFile,
  [Parameter(Mandatory = $true)][string]$TimeFile
)

$ErrorActionPreference = 'Stop'

function Write-TextFile([string]$Path, [string]$Content) {
  $enc = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($Path, [string]$Content, $enc)
}

if (-not ('DsojNativeStats' -as [type])) {
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class DsojNativeStats {
  [StructLayout(LayoutKind.Sequential)]
  public struct PROCESS_MEMORY_COUNTERS_EX {
    public uint cb;
    public uint PageFaultCount;
    public UIntPtr PeakWorkingSetSize;
    public UIntPtr WorkingSetSize;
    public UIntPtr QuotaPeakPagedPoolUsage;
    public UIntPtr QuotaPagedPoolUsage;
    public UIntPtr QuotaPeakNonPagedPoolUsage;
    public UIntPtr QuotaNonPagedPoolUsage;
    public UIntPtr PagefileUsage;
    public UIntPtr PeakPagefileUsage;
    public UIntPtr PrivateUsage;
  }

  [DllImport("psapi.dll", SetLastError = true)]
  public static extern bool GetProcessMemoryInfo(IntPtr hProcess, out PROCESS_MEMORY_COUNTERS_EX counters, uint size);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool GetProcessTimes(IntPtr hProcess, out long creation, out long exit, out long kernel, out long user);

  public static long ReadPeakWsBytes(IntPtr handle) {
    PROCESS_MEMORY_COUNTERS_EX pmc = new PROCESS_MEMORY_COUNTERS_EX();
    pmc.cb = (uint)Marshal.SizeOf(typeof(PROCESS_MEMORY_COUNTERS_EX));
    if (!GetProcessMemoryInfo(handle, out pmc, pmc.cb)) return 0L;
    return (long)pmc.PeakWorkingSetSize.ToUInt64();
  }

  public static int ReadCpuMs(IntPtr handle) {
    long creation, exit, kernel, user;
    if (!GetProcessTimes(handle, out creation, out exit, out kernel, out user)) return 0;
    double ms = (kernel + user) / 10000.0;
    if (ms < 0) return 0;
    int rounded = (int)Math.Round(ms);
    return rounded < 1 && (kernel + user) > 0 ? 1 : rounded;
  }
}
"@
}

try {
  if (-not (Test-Path -LiteralPath $InputFile)) {
    Write-TextFile -Path $InputFile -Content ''
  }

  $argList = @()
  if ($ArgumentList -and $ArgumentList -ne '[]') {
    $parsed = $ArgumentList | ConvertFrom-Json
    if ($null -ne $parsed) {
      if ($parsed -is [System.Array]) { $argList = @($parsed) }
      else { $argList = @($parsed) }
    }
  }

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $Executable
  if ($argList.Count -gt 0) {
    $quoted = @()
    foreach ($a in $argList) {
      $s = [string]$a
      if ($s -match '[\s"]') {
        $quoted += '"' + ($s -replace '"', '\"') + '"'
      } else {
        $quoted += $s
      }
    }
    $psi.Arguments = [string]::Join(' ', $quoted)
  }
  $psi.WorkingDirectory = $WorkingDirectory
  $psi.UseShellExecute = $false
  $psi.RedirectStandardInput = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true

  $p = New-Object System.Diagnostics.Process
  $p.StartInfo = $psi
  [void]$p.Start()

  $stdoutTask = $p.StandardOutput.ReadToEndAsync()
  $stderrTask = $p.StandardError.ReadToEndAsync()
  $inputText = ''
  if (Test-Path -LiteralPath $InputFile) {
    $inputText = [System.IO.File]::ReadAllText($InputFile)
  }
  if ($null -eq $inputText) { $inputText = '' }
  $p.StandardInput.Write($inputText)
  $p.StandardInput.Close()

  $peakBytes = [int64]0
  try {
    $sample = [DsojNativeStats]::ReadPeakWsBytes($p.Handle)
    if ($sample -gt $peakBytes) { $peakBytes = $sample }
  } catch {}

  while (-not $p.HasExited) {
    try {
      $sample = [DsojNativeStats]::ReadPeakWsBytes($p.Handle)
      if ($sample -gt $peakBytes) { $peakBytes = $sample }
    } catch {}
    Start-Sleep -Milliseconds 5
  }

  try {
    $sample = [DsojNativeStats]::ReadPeakWsBytes($p.Handle)
    if ($sample -gt $peakBytes) { $peakBytes = $sample }
  } catch {}

  $cpuMs = 0
  try { $cpuMs = [DsojNativeStats]::ReadCpuMs($p.Handle) } catch { $cpuMs = 0 }

  $stdout = $stdoutTask.GetAwaiter().GetResult()
  $stderr = $stderrTask.GetAwaiter().GetResult()
  if ($null -eq $stdout) { $stdout = '' }
  if ($null -eq $stderr) { $stderr = '' }

  Write-TextFile -Path $OutputFile -Content $stdout
  Write-TextFile -Path $ErrorFile -Content $stderr

  $peakKB = [int][math]::Round($peakBytes / 1024.0)
  if ($peakKB -lt 0) { $peakKB = 0 }
  Write-TextFile -Path $MemFile -Content "$peakKB"
  Write-TextFile -Path $TimeFile -Content "$cpuMs"

  $exitCode = 0
  try { $exitCode = $p.ExitCode } catch { $exitCode = 1 }
  try { $p.Dispose() } catch {}
  exit $exitCode
} catch {
  try { Write-TextFile -Path $ErrorFile -Content $_.Exception.Message } catch {}
  try { Write-TextFile -Path $MemFile -Content '0' } catch {}
  try { Write-TextFile -Path $TimeFile -Content '0' } catch {}
  exit 1
}
