// 代码编译器（简化版 - 实际应在Docker中执行）
import { writeFile, mkdir, unlink } from 'fs/promises'
import { exec } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import { existsSync } from 'fs'
import { logger } from '@/lib/logger'
import { CompileState } from './types'

const execPromise = promisify(exec)

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
    compileCommand: (source, output) => `javac "${source}"`,
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
  const randomId = Math.random().toString(36).substring(7)
  const filename = `solution_${timestamp}_${randomId}`
  const sourcePath = join(tempDir, `${filename}${config.extension}`)

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
    let outputPath = join(tempDir, filename)
    
    // 在Windows平台上，为C/C++编译的可执行文件添加.exe扩展名
    if (process.platform === 'win32' && (language === 'cpp' || language === 'c')) {
      outputPath += '.exe'
    }
    
    const compileCommand = config.compileCommand!(sourcePath, outputPath)

    logger.debug(`编译命令`, { command: compileCommand })

    try {
      const { stdout, stderr } = await execPromise(compileCommand, {
        timeout: 30000, // 30秒编译超时
        maxBuffer: 1024 * 1024, // 1MB buffer
      })

      // 编译成功
      return {
        success: true,
        compileState: CompileState.CompileSuccessfully,
        compiledPath: outputPath,
        stderr: stderr || undefined,
      }
    } catch (error) {
      const err = error as { killed?: boolean; signal?: string; stderr?: string; message?: string }
      // 编译超时
      if (err.killed === true || err.signal === 'SIGTERM') {
        return {
          success: false,
          compileState: CompileState.CompileTimeLimitExceeded,
          error: '编译超时',
        }
      }
      // 编译失败
      return {
        success: false,
        compileState: CompileState.CompileError,
        error: '编译错误',
        stderr: err.stderr || err.message,
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
