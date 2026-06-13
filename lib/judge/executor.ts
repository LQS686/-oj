import { exec, execSync, spawn, ChildProcess } from 'child_process'
import { promisify } from 'util'
import { writeFile, unlink } from 'fs/promises'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { getRunCommand } from './compiler'
import { logger } from '@/lib/logger'
import pidusage from 'pidusage'

const execPromise = promisify(exec)
const USE_DOCKER = process.env.USE_DOCKER === 'true' || false

export interface ExecuteOptions {
  code: string
  language: string
  input: string
  timeLimit: number
  memoryLimit: number
  compiledPath?: string
}

export interface ExecuteResult {
  output: string
  error?: string
  time: number
  memory: number
  exitCode: number
  timeout: boolean
  memoryExceeded: boolean
  runtimeError: boolean
}

export async function executeCode(options: ExecuteOptions): Promise<ExecuteResult> {
  const {
    language,
    input,
    timeLimit,
    memoryLimit,
    compiledPath,
  } = options

  if (!compiledPath) {
    throw new Error('缺少编译路径')
  }

  const tempDir = join(process.cwd(), 'temp', 'judge')
  const timestamp = Date.now()
  const randomId = Math.random().toString(36).substring(7)
  const inputPath = join(tempDir, `input_${timestamp}_${randomId}.txt`)
  const outputPath = join(tempDir, `output_${timestamp}_${randomId}.txt`)
  const errorPath = join(tempDir, `error_${timestamp}_${randomId}.txt`)

  try {
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true })
    }

    await writeFile(inputPath, input, 'utf-8')

    // 注意：startTime / endTime 放在 spawn/exit 紧邻位置，
    // 仅测量"进程实际运行"的时长，排除输入写出、流管道搭建、
    // 子进程创建（spawn overhead）以及输出读盘的 I/O 时间。
    // 这样可以避免首测点因冷启动被多算几百毫秒。
    let output = ''
    let error = ''
    let exitCode = 0
    let timeout = false
    let runtimeError = false
    let memoryExceeded = false
    let peakMemoryKB = 0
    let startTime = 0
    let endTime = 0

    if (USE_DOCKER) {
      const containerId = `judge_${timestamp}_${randomId}`
      const baseImage = getDockerImage(language)
      
      const dockerRunCommand = [
        'run', '--rm', '--name', containerId,
        '--memory', `${memoryLimit}m`,
        '--memory-swap', `${memoryLimit * 2}m`,
        '--cpus', '1',
        '--network', 'none',
        '--security-opt', 'no-new-privileges',
        '--cap-drop', 'ALL',
        '--read-only',
        '--tmpfs', '/tmp',
        '--tmpfs', '/app/temp',
        '--user', 'nobody',
        '--pids-limit', '100',
        '--ulimit', 'nofile=1024:1024',
        baseImage,
        'bash', '-c',
        `cd /app/temp && ${getDockerRunCommand(language, compiledPath, inputPath)} > output_${timestamp}_${randomId}.txt 2>&1`
      ]

      logger.debug(`执行Docker命令`, { command: dockerRunCommand.join(' ') })

      const dockerProcess = spawn('docker', dockerRunCommand, {
        timeout: timeLimit + 1000,
        stdio: 'inherit'
      })

      // 仅在进程已 spawn、即将被等待时计时
      startTime = Date.now()

      await new Promise<void>((resolve, reject) => {
        let timeoutId: NodeJS.Timeout

        timeoutId = setTimeout(() => {
          logger.debug(`Docker执行超时，强制终止容器`)
          timeout = true
          spawn('docker', ['rm', '-f', containerId], { detached: true, stdio: 'ignore' })
          dockerProcess.kill()
          endTime = Date.now()
          resolve()
        }, timeLimit + 1000)

        dockerProcess.on('exit', (code) => {
          clearTimeout(timeoutId)
          endTime = Date.now()
          exitCode = code || 0
          if (code !== 0 && !timeout) {
            runtimeError = true
          }
          resolve()
        })

        dockerProcess.on('error', (err) => {
          clearTimeout(timeoutId)
          endTime = Date.now()
          runtimeError = true
          error = err.message
          resolve()
        })
      })

      try {
        const fs = await import('fs/promises')
        const outputFile = join(tempDir, `output_${timestamp}_${randomId}.txt`)
        if (existsSync(outputFile)) {
          output = await fs.readFile(outputFile, 'utf-8')
        }
      } catch (err) {
        logger.error(`读取Docker输出失败`, err)
      }

      peakMemoryKB = await getDockerContainerMemory(containerId)
    } else {
      const runInfo = getRunInfo(language, compiledPath, inputPath, outputPath, errorPath)
      
      logger.debug(`执行命令`, { command: runInfo.command, args: runInfo.args })

      const childProcess = spawn(runInfo.command, runInfo.args, {
        cwd: tempDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: false
      })

      const maxMemoryBytes = memoryLimit * 1024 * 1024
      let monitorInterval: NodeJS.Timeout | null = null
      let processKilled = false

      if (childProcess.pid) {
        monitorInterval = setInterval(async () => {
          if (processKilled || !childProcess.pid) return
          
          try {
            const stats = await pidusage(childProcess.pid)
            const currentMemoryKB = Math.round(stats.memory / 1024)
            
            if (currentMemoryKB > peakMemoryKB) {
              peakMemoryKB = currentMemoryKB
            }
            
            if (stats.memory > maxMemoryBytes) {
              logger.debug(`内存超过限制`, { 
                current: Math.round(stats.memory / 1024 / 1024), 
                limit: memoryLimit 
              })
              memoryExceeded = true
              processKilled = true
              childProcess.kill('SIGKILL')
              if (monitorInterval) clearInterval(monitorInterval)
            }
          } catch (err) {
            // 进程可能已结束
          }
        }, 50)
      }

      const { createReadStream, createWriteStream } = await import('fs')
      const inputStream = createReadStream(inputPath)
      inputStream.pipe(childProcess.stdin)
      
      const outputStream = createWriteStream(outputPath)
      const errorStream = createWriteStream(errorPath)
      
      childProcess.stdout.pipe(outputStream)
      childProcess.stderr.pipe(errorStream)

      // 在流管道搭建完毕、进程即将被等待退出时开始计时
      startTime = Date.now()

      await new Promise<void>((resolve, reject) => {
        let timeoutId: NodeJS.Timeout

        timeoutId = setTimeout(() => {
          logger.debug(`执行超时，强制终止进程`)
          timeout = true
          
          if (!processKilled) {
            processKilled = true
            
            childProcess.kill('SIGINT')
            
            setTimeout(() => {
              childProcess.kill('SIGTERM')
            }, 100)
            
            setTimeout(() => {
              childProcess.kill('SIGKILL')
            }, 200)
            
            if (process.platform === 'win32') {
              try {
                execSync(`taskkill /F /T /PID ${childProcess.pid}`, { stdio: 'ignore' })
              } catch (killError: any) {
                // 忽略
              }
            }
          }
          
          if (monitorInterval) clearInterval(monitorInterval)
          if (!endTime) endTime = Date.now()
          resolve()
        }, timeLimit + 1000)

        childProcess.on('exit', (code) => {
          clearTimeout(timeoutId)
          if (monitorInterval) clearInterval(monitorInterval)
          processKilled = true
          // 进程退出瞬间立刻记录时间，避免被文件 I/O 计入
          endTime = Date.now()
          exitCode = code || 0
          if (code !== 0 && !timeout) {
            runtimeError = true
          }
          resolve()
        })

        childProcess.on('error', (err) => {
          clearTimeout(timeoutId)
          if (monitorInterval) clearInterval(monitorInterval)
          processKilled = true
          endTime = Date.now()
          runtimeError = true
          error = err.message
          resolve()
        })
      })

      try {
        const fs = await import('fs/promises')
        if (existsSync(outputPath)) {
          output = await fs.readFile(outputPath, 'utf-8')
        }
        if (existsSync(errorPath)) {
          error = await fs.readFile(errorPath, 'utf-8')
        }
      } catch (err) {
        logger.error(`读取输出失败`, err)
      }
    }

    // 兜底：极端异常时（startTime / endTime 未设置）使用当前时刻
    if (!startTime) startTime = Date.now()
    if (!endTime) endTime = Date.now()
    const execTime = Math.max(0, endTime - startTime)
    const preciseTime = Math.max(1, Math.round(execTime))

    if (peakMemoryKB === 0) {
      peakMemoryKB = getEstimatedBaseMemory(language)
    }

    try {
      if (existsSync(inputPath)) await unlink(inputPath)
      if (existsSync(outputPath)) await unlink(outputPath)
      if (existsSync(errorPath)) await unlink(errorPath)
    } catch (cleanupError) {
      logger.warn(`清理临时文件失败`, { error: cleanupError })
    }

    let detailedError = undefined;
    
    if (timeout) {
      detailedError = `Time Limit Exceeded (>${timeLimit}ms)`;
    } else if (memoryExceeded) {
      detailedError = `Memory Limit Exceeded (>${memoryLimit}MB)`;
    } else if (runtimeError) {
      const errLines = error.split('\n');
      const lastLine = errLines[errLines.length - 1] || errLines[errLines.length - 2] || 'Runtime Error';
      detailedError = `Runtime Error: ${lastLine}`;
      if (error) detailedError += `\n${error.substring(0, 500)}`;
    }

    return {
      output,
      error: detailedError,
      time: preciseTime,
      memory: peakMemoryKB,
      exitCode,
      timeout,
      memoryExceeded,
      runtimeError,
    }
  } catch (err) {
    try {
      if (existsSync(inputPath)) await unlink(inputPath)
      if (existsSync(outputPath)) await unlink(outputPath)
      if (existsSync(errorPath)) await unlink(errorPath)
    } catch (cleanupError) {
    }
    
    throw new Error(`执行错误: ${err instanceof Error ? err.message : String(err)}`)
  }
}

function getEstimatedBaseMemory(language: string): number {
  switch (language) {
    case 'cpp':
    case 'c':
      return 1024
    case 'java':
      return 16384
    case 'python':
      return 4096
    case 'javascript':
      return 8192
    default:
      return 1024
  }
}

async function getDockerContainerMemory(containerId: string): Promise<number> {
  try {
    const { stdout } = await execPromise(
      `docker stats ${containerId} --no-stream --format "{{.MemUsage}}" 2>/dev/null || echo "0B"`
    )
    const memStr = stdout.trim()
    const match = memStr.match(/([\d.]+)(GiB|MiB|KiB|B)/i)
    if (match) {
      const value = parseFloat(match[1])
      const unit = match[2].toLowerCase()
      switch (unit) {
        case 'gib': return Math.round(value * 1024 * 1024)
        case 'mib': return Math.round(value * 1024)
        case 'kib': return Math.round(value)
        case 'b': return Math.round(value / 1024)
      }
    }
  } catch (err) {
    // 容器可能已删除
  }
  return 0
}

function getRunInfo(language: string, compiledPath: string, inputPath: string, outputPath: string, errorPath: string): { command: string, args: string[] } {
  const relativeCompiledPath = compiledPath.split('\\').pop() || compiledPath.split('/').pop() || ''
  const relativeInputPath = inputPath.split('\\').pop() || inputPath.split('/').pop() || ''
  const relativeOutputPath = outputPath.split('\\').pop() || outputPath.split('/').pop() || ''
  const relativeErrorPath = errorPath.split('\\').pop() || errorPath.split('/').pop() || ''
  
  const commands: Record<string, { command: string, args: string[] }> = {
    cpp: {
      command: relativeCompiledPath,
      args: []
    },
    c: {
      command: relativeCompiledPath,
      args: []
    },
    java: {
      command: 'java',
      args: [relativeCompiledPath.replace('.class', '')]
    },
    python: {
      command: process.platform === 'win32' ? 'python' : 'python3',
      args: [relativeCompiledPath]
    },
    javascript: {
      command: 'node',
      args: [relativeCompiledPath]
    }
  }
  
  const cmdInfo = commands[language] || { command: relativeCompiledPath, args: [] }
  
  if (process.platform === 'win32') {
    let executablePath = cmdInfo.command;
    let args = [...cmdInfo.args];
    
    if (executablePath.startsWith('./')) {
      executablePath = executablePath.substring(2);
    }
    
    if ((language === 'cpp' || language === 'c') && !executablePath.endsWith('.exe')) {
      executablePath += '.exe';
    }
    
    if (language !== 'cpp' && language !== 'c') {
      args = args.map(arg => {
        if (arg.startsWith('./')) {
          return arg.substring(2);
        }
        return arg;
      });
    }
    
    return {
      command: executablePath,
      args: args
    };
  } else {
    return {
      command: cmdInfo.command,
      args: cmdInfo.args
    }
  }
}

function getDockerImage(language: string): string {
  const images: Record<string, string> = {
    cpp: 'gcc:12',
    c: 'gcc:12',
    java: 'openjdk:17',
    python: 'python:3.11',
    javascript: 'node:18',
  }
  return images[language] || 'ubuntu:22.04'
}

function getDockerRunCommand(language: string, compiledPath: string, inputPath: string): string {
  const relativeCompiledPath = compiledPath.split('\\').pop() || compiledPath.split('/').pop() || ''
  const relativeInputPath = inputPath.split('\\').pop() || inputPath.split('/').pop() || ''
  
  const safeCompiledPath = relativeCompiledPath.replace(/\\/g, '/')
  const safeInputPath = relativeInputPath.replace(/\\/g, '/')
  
  const commands: Record<string, string> = {
    cpp: `./${safeCompiledPath} < ${safeInputPath}`,
    c: `./${safeCompiledPath} < ${safeInputPath}`,
    java: `java ${safeCompiledPath.replace('.class', '')} < ${safeInputPath}`,
    python: `python3 ${safeCompiledPath} < ${safeInputPath}`,
    javascript: `node ${safeCompiledPath} < ${safeInputPath}`,
  }
  
  return commands[language] || safeCompiledPath
}
