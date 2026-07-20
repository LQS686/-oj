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
// 评测机减负（2026-07）：移除 java/javascript 支持，仅保留 C/C++/Python
//   节省镜像体积 ~500MB（openjdk11-jdk + node + py3-pip + gfortran）
//
// 编译参数参考（2026-07）：
//   - 参考 HOJ SandboxRun.java：用 -w 关闭所有编译警告，避免新学员困惑
//     （学员本地无 -O2/-Wall 时能编译，OJ 启用 -Wall -Wextra 后某些 UB 警告
//      在 -O2 优化下可能被 gcc 提升为 error，导致"本地能跑、OJ 编译失败"）
//   - 保留 -fmax-errors=3 限制真正的编译错误数量（参考 HOJ SPJ 配置）
//   - 引入 -fsanitize=undefined -fno-sanitize-recover=all 支持藏数据题
//     （UB 在运行时检测，而非编译时；触发即 RE，而非"使用垃圾值"通过）
//
// JUDGE_ENABLE_UBSAN 环境变量控制是否启用 UBSanitizer：
//   - 'true'：强制启用（需确保环境提供 libubsan，Linux gcc 默认静态链接）
//   - 'false'：强制禁用
//   - 未设置：自动判断 —— 仅在 Linux + Docker 模式下启用（生产环境）
//
// 不在 Windows 本地模式默认启用的原因：
//   MinGW 默认不提供 libubsan（-lubsan: No such file or directory），
//   学员/开发者在 Windows 本地编译会失败。UBSan 仅在生产 Docker 镜像
//   （基于 gcc 官方镜像，含 libubsan）下启用。
//
// 启用后：
//   - 编译时加 -fsanitize=undefined -fno-sanitize-recover=all
//   - 运行时需链接 libubsan（gcc 默认静态链接，Docker 镜像需安装 libubsan）
//   - UBSanitizer 有 2-3x 内存开销，需相应调大 memoryLimit
const ENABLE_UBSAN = (() => {
  const flag = process.env.JUDGE_ENABLE_UBSAN
  if (flag === 'true') return true
  if (flag === 'false') return false
  // 默认：仅 Linux + Docker 模式启用（生产环境）
  return process.platform === 'linux' && process.env.USE_DOCKER === 'true'
})()

const languageConfigs: Record<string, {
  extension: string
  compileCommand?: (source: string, output: string) => string
  needsCompile: boolean
}> = {
  cpp: {
    extension: '.cpp',
    compileCommand: (source, output) => buildCompileCommand('g++', 'c++17', source, output),
    needsCompile: true,
  },
  c: {
    extension: '.c',
    compileCommand: (source, output) => buildCompileCommand('gcc', 'c11', source, output),
    needsCompile: true,
  },
  python: {
    extension: '.py',
    needsCompile: false,
  },
}

/**
 * 构建 C/C++ 编译命令参数数组
 *
 * 参数说明：
 *   - -O2：标准优化（与 HOJ/Hydro 一致）
 *   - -std=c++17/c11：现代标准（项目约束：C++ 标准代码必须 c++17）
 *   - -w：关闭所有编译警告（参考 HOJ SandboxRun.java）
 *     原因：-Wall -Wextra 在 -O2 优化下，gcc 可能将某些"必定 UB"的代码路径
 *     （如未初始化变量使用）视为 error 而非 warning，导致学员代码
 *     "本地能编译、OJ 编译失败"的困惑。藏数据题的 UB 检测改由 UBSan 在
 *     运行时完成，不在编译阶段拦截。
 *   - -fmax-errors=3：编译错误上限，避免超长错误日志（参考 HOJ SPJ 配置）
 *   - -DONLINE_JUDGE：标准 OJ 标志位，题目代码可据此调整行为（如禁用 assert）
 *
 * UBSanitizer 参数（ENABLE_UBSAN=true 时启用，用于检测藏数据题）：
 *   - -fsanitize=undefined：启用未定义行为检测
 *     覆盖：有符号整数溢出、整数转换溢出、除零、空指针解引用、
 *     未对齐访问、返回值忽略、变量未初始化读取（部分场景）等
 *   - -fno-sanitize-recover=all：UB 触发时立即终止进程（退出码非0 → RE），
 *     而非仅打印警告继续执行（默认行为）
 *   - -fno-omit-frame-pointer：保留帧指针，便于 sanitizer 定位栈
 *
 * 重要：-fsanitize=undefined 不能检测所有未初始化读取（如 int a; cout<<a;），
 *   只能检测"a 被使用但从未赋值"的部分场景。完整未初始化检测需
 *   -fsanitize=memory（仅 Clang 支持），当前项目使用 gcc 不适用。
 *   但 UBSan 已能覆盖大部分藏数据题的 UB 场景（溢出/除零/空指针等）。
 *   UBSan 检测不到的场景（如部分未初始化读取）依赖测试数据判 WA。
 */
function buildCompileArgs(
  compiler: 'g++' | 'gcc',
  std: string,
  sourcePath: string,
  outputPath: string
): string[] {
  const args = [
    '-O2',
    `-std=${std}`,
    '-w',
    '-fmax-errors=3',
    '-DONLINE_JUDGE',
  ]

  if (ENABLE_UBSAN) {
    args.push(
      '-fsanitize=undefined',
      '-fno-sanitize-recover=all',
      '-fno-omit-frame-pointer'
    )
  }

  args.push('-o', outputPath, sourcePath)
  // compiler 作为返回值的一部分供调用方使用
  void compiler
  return args
}

/** 构造 compileCommand 字符串（仅用于 languageConfigs.compileCommand 字段展示） */
function buildCompileCommand(compiler: 'g++' | 'gcc', std: string, source: string, output: string): string {
  return `${compiler} ${buildCompileArgs(compiler, std, source, output).join(' ')}`
}

/**
 * 使用 spawn 执行编译命令，收集 stdout/stderr/exitCode
 *
 * 重要：必须使用 spawn 而非 exec！
 * - exec 在 Alpine Linux 上存在 shell 解析问题，且 maxBuffer 限制可能导致截断
 * - spawn 直接调用命令数组，不经过 shell，更可靠且安全
 * - 切勿改回 exec，否则评测编译会静默失败（exitCode=1，stderr 为空）
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
  const sourceName = filename
  const compiledBasename = filename

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
    // 使用 runner.sh 进行资源限制
    const useRunnerSh = true
    if (useSandbox && useRunnerSh) {
      // 重要：ESM/tsx 环境下 __dirname 不可靠（可能指向缓存目录或 undefined），
      // 必须使用 process.cwd() 构建路径，否则 runner.sh 找不到导致编译失败。
      const runnerPath = join(process.cwd(), 'lib', 'judge', 'runner.sh')
      // runner.sh 后接：内存MB CPU秒 栈MB 命令 参数...
      // UBSanitizer 编译时需更大内存（默认 512MB，UBSan 静态链接开销 ~50MB）
      const compileMemMb = ENABLE_UBSAN ? '768' : '512'
      const compiler = language === 'c' ? 'gcc' : 'g++'
      const std = language === 'c' ? 'c11' : 'c++17'
      // 编译参数（不含 compiler 名称，由 runner.sh 单独传）
      const compileArgs = buildCompileArgs(compiler as 'g++' | 'gcc', std, sourcePath, outputPath)
      spawnCmd = 'bash'
      spawnArgs = [runnerPath, compileMemMb, '15', '64', compiler, ...compileArgs]
    } else {
      // 非沙箱模式（Windows 或 Docker 模式）
      if (language === 'cpp') {
        spawnCmd = 'g++'
        spawnArgs = buildCompileArgs('g++', 'c++17', sourcePath, outputPath)
      } else if (language === 'c') {
        spawnCmd = 'gcc'
        spawnArgs = buildCompileArgs('gcc', 'c11', sourcePath, outputPath)
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
    python: `python "${compiledPath}"`,
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
