/**
 * Windows 原生评测 runner（LemonLime 同款 GetProcessTimes / GetProcessMemoryInfo）
 * 首次需要时用 .NET Framework csc 编译 win-runner.cs → win-runner.exe
 */
import { existsSync, statSync } from 'fs'
import { join } from 'path'
import { spawnSync } from 'child_process'
import { logger } from '@/lib/logger'

const RUNNER_DIR = () => join(process.cwd(), 'lib', 'judge')
const EXE_NAME = 'win-runner.exe'
const SRC_NAME = 'win-runner.cs'

function findCsc(): string | null {
  const roots = [
    process.env['WINDIR'] || 'C:\\Windows',
    'C:\\Windows',
  ]
  const frameworks = [
    'Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
    'Microsoft.NET\\Framework\\v4.0.30319\\csc.exe',
  ]
  for (const root of roots) {
    for (const rel of frameworks) {
      const p = join(root, rel)
      if (existsSync(p)) return p
    }
  }
  return null
}

/**
 * 返回可用的 win-runner.exe 绝对路径；不可用时返回 null（调用方回退 ps1）。
 */
export function ensureWinRunnerExe(): string | null {
  if (process.platform !== 'win32') return null

  const dir = RUNNER_DIR()
  const exePath = join(dir, EXE_NAME)
  const srcPath = join(dir, SRC_NAME)

  const exeOk = existsSync(exePath)
  const srcOk = existsSync(srcPath)
  if (exeOk && srcOk) {
    try {
      if (statSync(exePath).mtimeMs >= statSync(srcPath).mtimeMs) {
        return exePath
      }
    } catch {
      // fall through to rebuild
    }
  } else if (exeOk && !srcOk) {
    return exePath
  }

  if (!srcOk) {
    logger.warn('win-runner.cs 缺失，无法编译原生 runner')
    return exeOk ? exePath : null
  }

  const csc = findCsc()
  if (!csc) {
    logger.warn('未找到 csc.exe，Windows 评测回退 PowerShell runner')
    return exeOk ? exePath : null
  }

  logger.info('编译 Windows 原生评测 runner', { csc, srcPath, exePath })
  const result = spawnSync(
    csc,
    ['/nologo', '/optimize+', `/out:${exePath}`, srcPath],
    {
      encoding: 'utf-8',
      windowsHide: true,
      timeout: 60000,
    }
  )
  if (result.status !== 0 || !existsSync(exePath)) {
    logger.warn('编译 win-runner.exe 失败，回退 PowerShell', {
      status: result.status,
      stdout: result.stdout?.slice(0, 500),
      stderr: result.stderr?.slice(0, 500),
    })
    return null
  }
  return exePath
}
