// 代码编译器（简化版 - 实际应在Docker中执行）
import { writeFile, mkdir, unlink } from 'fs/promises'
import { spawn } from 'child_process'
import { join } from 'path'
import { existsSync } from 'fs'
import * as crypto from 'crypto'
import { logger } from '@/lib/logger'
import { CompileState } from './types'

// 编译超时（毫秒）：Windows 下 MinGW g++ 首次启动较慢（含 Defender 扫描），需更宽松；
// Linux 下 runner.sh 的 cpu_sec=15 为硬限制，exec timeout 略大作为兜底
const DEFAULT_COMPILE_TIMEOUT = parseInt(
  process.env.JUDGE_COMPILE_TIMEOUT || (process.platform === 'win32' ? '30000' : '20000'),
  10,
)

export interface CompileResult {
  success: boolean
  compileState: CompileState
  compiledPath?: string
  error?: string
  stderr?: string
}

// 语言配置
const languageConfigs: Record<string, {
  extension: string
  compileCommand?: (source: string, output: string) => string
  needsCompile: boolean
}> = {
  cpp: {
    extension: '.cpp',
    compileCommand: (source, output) => `g++ -O2 -std=c++17 -o "${output}" "${source}"`,
    needsCompile: true,
  },
  c: {
    extension: '.c',
    compileCommand: (source, output) => `gcc -O2 -std=c11 -o "${output}" "${source}"`,
    needsCompile: true,
  },
  java: {
    extension: '.java',
    compileCommand: (source, _output) => `javac "${source}"`,
    needsCompile: true,
  },
  python: {
    extension: '.py',
    needsCompile: false,
  },
  javascript: {
    extension: '.js',
    needsCompile: false,
  },
}

/**
 * 使用 spawn 执行编译命令，收集 stdout/stderr/exitCode
 * 比 exec 更可靠（无 maxBuffer 限制，不经过 shell 解析）
 */
function spawnCompile(cmd: string, args: string[], timeoutMs: number): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { timeout: timeoutMs })
    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (data) => { stdout += data.toString() })
    child.stderr?.on('data', (data) => { stderr += data.toString() })

    child.on('error', (err) => {
      reject(err)
    })

    child.on('close', (code, signal) => {
      if (signal) {
        logger.debug(`编译进程被信号终止`, { signal, cmd, args })
      }
      resolve({ exitCode: code ?? 1, stdout, stderr })
    })
  })
}

// 编译错误信息过滤：将 stderr 中的临时绝对路径与 solution_* 文件名替换为 solution.{ext}
function filterCompileError(stderr: string, ext: string): string {
  const filtered = stderr
    // 替换绝对路径前缀（覆盖所有语言的临时文件名：solution_*、className、等）
    .replace(/(?:[a-zA-Z]:)?[^\s:]*temp[\\/]judge[\\/][^\s:]+/g, `solution.${ext}`)
    // 替换 solution_* 文件名（向后兼容）
    .replace(/solution_\d+_[a-z0-9]+/g, `solution.${ext}`)
  return filtered
}

// 编译代码
export async function compileCode(code: string, language: string): Promise<CompileResult> {
  const config = languageConfigs[language]

  if (!config) {
    return {
      success: false,
      compileState: CompileState.NoValidSourceFile,
      error: `不支持的语言: ${language}`,
    }
  }

  if (!code || !code.trim()) {
    return {
      success: false,
      compileState: CompileState.NoValidSourceFile,
      error: '源代码为空',
    }
  }

  // 创建临时目录
  const tempDir = join(process.cwd(), 'temp', 'judge')
  if (!existsSync(tempDir)) {
    await mkdir(tempDir, { recursive: true })
  }

  const timestamp = Date.now()
  const randomId = crypto.randomBytes(8).toString('hex')
  const filename = `solution_${timestamp}_${randomId}`

  // Java: 解析主类名作为源文件名，javac 据此产出 {className}.class
  // 其他语言: 保持 solution_* 命名
  let sourceName = filename
  let compiledBasename = filename
  if (language === 'java') {
    const classMatch = code.match(/(?:public\s+)?class\s+(\w+)/)
    if (classMatch) {
      sourceName = classMatch[1]
      compiledBasename = classMatch[1]
    }
    // 无 class 声明（语法错误）回退为 solution_*，由 javac 报 CE
  }

  const sourcePath = join(tempDir, `${sourceName}${config.extension}`)

  try {
    // 写入源代码文件
    await writeFile(sourcePath, code, 'utf-8')

    // 如果不需要编译（如Python、JavaScript）
    if (!config.needsCompile) {
      return {
        success: true,
        compileState: CompileState.CompileSuccessfully,
        compiledPath: sourcePath,
      }
    }

    // 编译代码
    let outputPath = join(tempDir, compiledBasename)

    // 在Windows平台上，为C/C++编译的可执行文件添加.exe扩展名
    if (process.platform === 'win32' && (language === 'cpp' || language === 'c')) {
      outputPath += '.exe'
    }

    const compileCommand = config.compileCommand!(sourcePath, outputPath)

    // Linux 非容器模式下编译走 runner.sh 沙箱（限制内存/CPU/栈/文件描述符）
    const isLinux = process.platform === 'linux'
    const useDocker = process.env.USE_DOCKER === 'true'
    const useSandbox = isLinux && !useDocker

    // 构建编译参数
    let spawnCmd: string
    let spawnArgs: string[]
    if (useSandbox) {
      // ESM 环境下 __dirname 不可靠，使用 process.cwd() 构建路径
      const runnerPath = join(process.cwd(), 'lib', 'judge', 'runner.sh')
      spawnCmd = 'bash'
      spawnArgs = [runnerPath, '512', '15', '64', 'g++', '-O2', '-std=c++17', '-o', outputPath, sourcePath]
      if (language === 'c') {
        spawnArgs = [runnerPath, '512', '15', '64', 'gcc', '-O2', '-std=c11', '-o', outputPath, sourcePath]
      } else if (language === 'java') {
        spawnArgs = [runnerPath, '512', '15', '64', 'javac', sourcePath]
      }
    } else {
      // 非沙箱模式（Windows 或 Docker 模式）
      if (language === 'cpp') {
        spawnCmd = 'g++'
        spawnArgs = ['-O2', '-std=c++17', '-o', outputPath, sourcePath]
      } else if (language === 'c') {
        spawnCmd = 'gcc'
        spawnArgs = ['-O2', '-std=c11', '-o', outputPath, sourcePath]
      } else if (language === 'java') {
        spawnCmd = 'javac'
        spawnArgs = [sourcePath]
      } else {
        spawnCmd = 'true'
        spawnArgs = []
      }
    }

    logger.debug(`编译命令`, { cmd: spawnCmd, args: spawnArgs, useSandbox })

    try {
      const { exitCode, stderr } = await spawnCompile(spawnCmd, spawnArgs, DEFAULT_COMPILE_TIMEOUT)

      if (exitCode === 0) {
        return {
          success: true,
          compileState: CompileState.CompileSuccessfully,
          compiledPath: outputPath,
          stderr: stderr || undefined,
        }
      }

      // 编译失败
      const ext = config.extension.substring(1)
      const filteredStderr = filterCompileError(stderr, ext)
      logger.warn(`编译失败详情`, { exitCode, stderr: filteredStderr, cmd: spawnCmd, args: spawnArgs })
      return {
        success: false,
        compileState: CompileState.CompileError,
        error: '编译错误',
        stderr: filteredStderr,
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      logger.error(`编译执行异常`, { error: errMsg, cmd: spawnCmd, args: spawnArgs })
      return {
        success: false,
        compileState: CompileState.CompileError,
        error: `编译执行异常: ${errMsg}`,
      }
    }
  } catch (error) {
    return {
      success: false,
      compileState: CompileState.CompileError,
      error: error instanceof Error ? error.message : '未知错误',
    }
  }
}

// 获取运行命令
export function getRunCommand(language: string, compiledPath: string, inputPath?: string): string {
  const commands: Record<string, string> = {
    cpp: compiledPath,
    c: compiledPath,
    java: `java -cp "${join(compiledPath, '..')}" ${compiledPath.split(/[/\\]/).pop()!.replace('.class', '')}`,
    python: `python "${compiledPath}"`,
    javascript: `node "${compiledPath}"`,
  }

  let command = commands[language] || compiledPath

  // 添加输入重定向
  if (inputPath) {
    command += ` < "${inputPath}"`
  }

  return command
}

// 清理临时文件
export async function cleanup(path?: string) {
  if (!path) return
  try {
    if (existsSync(path)) {
      await unlink(path)
    }
  } catch (e) {
    logger.warn(`清理文件失败`, { path, error: e })
  }
}
