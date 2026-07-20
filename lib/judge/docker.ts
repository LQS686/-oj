import { spawn, spawnSync } from 'child_process'
import { logger } from '@/lib/logger'

// PERF-01 修复：生产环境未启用 Docker 沙箱评测时告警。
// 注意：懒检查 —— 不在模块加载时抛错，避免 next build 收集页面数据时因构建环境未设 USE_DOCKER 而失败。
// 与 worker.ts 保持一致：仅 warn 不 throw，因为容器内部署 USE_DOCKER=false 是合法配置（容器本身已隔离）。
export function assertDockerJudgeEnabled() {
  // 构建阶段跳过（next build 时 NEXT_PHASE=phase-production-build）
  if (process.env.NEXT_PHASE === 'phase-production-build') return
  if (process.env.NODE_ENV === 'production' && process.env.USE_DOCKER !== 'true') {
    logger.warn('⚠️ [安全] 生产环境未启用 Docker 评测沙箱，选手代码可能访问进程资源。若在容器内部署则属正常配置。')
  }
}

export function getRunInfo(language: string, compiledPath: string): { command: string, args: string[] } {
  const relativeCompiledPath = compiledPath.split('\\').pop() || compiledPath.split('/').pop() || ''

  const commands: Record<string, { command: string, args: string[] }> = {
    cpp: {
      command: relativeCompiledPath,
      args: []
    },
    c: {
      command: relativeCompiledPath,
      args: []
    },
    python: {
      command: process.platform === 'win32' ? 'python' : 'python3',
      args: [relativeCompiledPath]
    },
  }

  const cmdInfo = commands[language] || { command: relativeCompiledPath, args: [] }

  if (process.platform === 'win32') {
    let executablePath = cmdInfo.command
    const args = [...cmdInfo.args]

    if (executablePath.startsWith('./')) {
      executablePath = executablePath.substring(2)
    }

    if ((language === 'cpp' || language === 'c') && !executablePath.endsWith('.exe')) {
      executablePath += '.exe'
    }

    if (language !== 'cpp' && language !== 'c') {
      args.forEach((arg, i) => {
        if (arg.startsWith('./')) {
          args[i] = arg.substring(2)
        }
      })
    }

    return {
      command: executablePath,
      args
    }
  } else {
    return {
      command: cmdInfo.command,
      args: cmdInfo.args
    }
  }
}

export function getDockerImage(language: string): string {
  const images: Record<string, string> = {
    cpp: 'gcc:12',
    c: 'gcc:12',
    python: 'python:3.11',
  }
  return images[language] || 'ubuntu:22.04'
}

/**
 * 已拉取的 Docker 镜像缓存（避免每次评测都执行 docker image inspect）
 * 首次评测时镜像不存在 → 触发 docker pull（允许长达 5 分钟）
 * 后续评测直接跳过检查，无额外开销
 */
const pulledImages = new Set<string>()

/**
 * 确保 Docker 评测镜像已存在本地，不存在则拉取。
 * 首次评测超时的主要根因：docker run 触发隐式拉取，但 spawn 超时仅 hardTimeoutMs（~1.2s），
 * 远不足以拉取数百 MB 镜像。本函数将"拉取"与"执行"分离，拉取使用独立的长超时。
 */
export async function ensureDockerImage(image: string): Promise<void> {
  if (pulledImages.has(image)) return

  // 检查镜像是否已存在
  try {
    // P2 安全修复：改为 spawnSync 数组形式，避免命令拼接注入风险
    const inspectResult = spawnSync('docker', ['image', 'inspect', image], { stdio: 'ignore', timeout: 5000 })
    if (inspectResult.status !== 0) {
      throw new Error(`docker image inspect 退出码: ${inspectResult.status}`)
    }
    pulledImages.add(image)
    logger.info(`Docker 镜像已存在`, { image })
    return
  } catch {
    // 镜像不存在，继续拉取
  }

  logger.info(`Docker 镜像不存在，开始拉取`, { image })
  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn('docker', ['pull', image], { stdio: 'inherit' })
      const timer = setTimeout(() => {
        proc.kill()
        reject(new Error('docker pull 超时'))
      }, 300_000)
      proc.on('close', (code) => {
        clearTimeout(timer)
        if (code === 0) resolve()
        else reject(new Error(`docker pull 失败，退出码: ${code}`))
      })
      proc.on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
    })
    pulledImages.add(image)
    logger.info(`Docker 镜像拉取完成`, { image })
  } catch (err) {
    throw new Error(`Docker 镜像拉取失败: ${image} - ${err instanceof Error ? err.message : String(err)}`)
  }
}

export function getDockerRunCommand(language: string, compiledPath: string, inputPath: string): string {
  const relativeCompiledPath = compiledPath.split('\\').pop() || compiledPath.split('/').pop() || ''
  const relativeInputPath = inputPath.split('\\').pop() || inputPath.split('/').pop() || ''

  const safeCompiledPath = relativeCompiledPath.replace(/\\/g, '/')
  const safeInputPath = relativeInputPath.replace(/\\/g, '/')

  const commands: Record<string, string> = {
    cpp: `./${safeCompiledPath} < ${safeInputPath}`,
    c: `./${safeCompiledPath} < ${safeInputPath}`,
    python: `python3 ${safeCompiledPath} < ${safeInputPath}`,
  }

  return commands[language] || safeCompiledPath
}
