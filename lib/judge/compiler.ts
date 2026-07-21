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
// JUDGE_ENABLE_UBSAN 环境变量控制是否启用 UBSanitizer（-fsanitize=undefined）：
//   - 'true'：强制启用（需确保环境提供 libubsan，Linux gcc 默认静态链接）
//   - 'false'：强制禁用
//   - 未设置：自动判断 —— 仅在 Linux 下启用（生产容器环境）
//
// 不在 Windows 本地模式默认启用的原因：
//   MinGW 默认不提供 libubsan（-lubsan: No such file or directory），
//   学员/开发者在 Windows 本地编译会失败。UBSan 仅在 Linux 环境
//   （Docker 容器内或 Linux 宿主）下启用。
//
// 启用后：
//   - 编译时加 -fsanitize=undefined -fno-sanitize-recover=all
//   - 运行时需链接 libubsan（gcc 默认静态链接，Alpine 需 apk add libubsan）
//   - UBSanitizer 有 2-3x 内存开销，需相应调大 memoryLimit
const ENABLE_UBSAN = (() => {
  const flag = process.env.JUDGE_ENABLE_UBSAN
  if (flag === 'true') return true
  if (flag === 'false') return false
  // 默认：Linux 环境启用（生产容器 / Linux 宿主）
  // 不依赖 USE_DOCKER：容器内模式（USE_DOCKER=false）仍是 Linux 环境，应启用
  return process.platform === 'linux'
})()

// JUDGE_ENABLE_ASAN 环境变量控制是否启用 AddressSanitizer（-fsanitize=address）：
//   - 'true'：强制启用（需 libasan，Linux gcc 默认提供）
//   - 'false'：强制禁用
//   - 未设置：自动判断 —— 仅在 Linux 下启用（生产容器环境）
//
// 启用后：
//   - 编译时加 -fsanitize=address -fno-sanitize-recover=all
//   - 检测：堆/栈数组越界、use-after-free、栈缓冲区溢出（UBSan 检测不到的场景）
//   - 与 UBSan 可同时启用（-fsanitize=address,undefined）
//   - 内存开销：评测时实际内存 = 题目 memoryLimit × 2-3，需相应调大 memoryLimit
//   - 性能开销：2-5x 减速
//
// 按竞赛 OJ 标准（Codeforces / AtCoder）默认开启 ASan+UBSan：
//   - Codeforces 在编译参数中加 -fsanitize=address,undefined
//   - AtCoder 同样默认启用 ASan+UBSan
//   - 这是检测"数组越界""use-after-free"等 UB 的最严格方案
// 教学型 OJ（HOJ/Hydro/洛谷）默认不开 sanitizer，依赖测试数据判 WA；
// 本项目作为教学+竞赛混合场景，按竞赛标准默认开启 ASan 以严格检测数组越界。
//
// 不在 Windows 本地模式默认启用的原因：
//   MinGW 默认不提供 libasan，学员/开发者在 Windows 本地编译会失败。
//   ASan 仅在 Linux 环境（Docker 容器内或 Linux 宿主）下启用。
//   Windows 本地模式仍受 -ftrivial-auto-var-init=pattern + -fstack-protector-all
//   + -D_FORTIFY_SOURCE=2 兜底，未初始化/栈溢出/libc 越界仍可检测。
//
// 注意：ASan 启用后题目默认 memoryLimit=128MB 可能不足以容纳 ASan 自身开销，
//   建议对启用 ASan 的题目把 memoryLimit 调至 256MB+。
const ENABLE_ASAN = (() => {
  const flag = process.env.JUDGE_ENABLE_ASAN
  if (flag === 'true') return true
  if (flag === 'false') return false
  // 默认：Linux 环境启用（生产容器 / Linux 宿主，对齐竞赛 OJ 标准）
  // 不依赖 USE_DOCKER：容器内模式（USE_DOCKER=false）仍是 Linux 环境，应启用
  return process.platform === 'linux'
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
 * 脏数据兜底参数（始终启用，无/极低运行时开销）：
 *   - -ftrivial-auto-var-init=pattern：把所有未显式初始化的栈变量初始化为
 *     pattern 字节填充值。GCC 12+ 用 0xFE 填充（int -> 0xFEFEFEFE），
 *     Clang 用 0xAA 填充（int -> 0xAAAAAAAA）。这样：
 *       1. 脏数据代码（int c; c+=a; c+=b;）的 c 不会是随机值，
 *          而是稳定的 0xFEFEFEFE + a + b（gcc），几乎必然判 WA（不再靠运气 AC）
 *       2. 合法代码（已初始化变量）不受影响
 *       3. 即使未启用 UBSan（Windows 本地模式），也能稳定检测这类 UB
 *     这是 gcc 下检测未初始化读取 UB 的最有效方案，比 UBSan 的未初始化
 *     检测更可靠。完整检测需 Clang 的 -fsanitize=memory，当前项目用 gcc 不适用。
 *     需要 gcc 12+，Alpine 3.18+ / Debian 12+ 的 gcc 均已支持。
 *     实测：MinGW gcc 13+ 也支持，Windows 本地模式同样生效。
 *   - -fwrapv：有符号整数溢出定义为回绕（二补码），避免优化器把
 *     "依赖有符号溢出的 UB 代码"优化成不可预期的结果。让溢出行为可预测。
 *   - -fstack-protector-all：为所有函数插入栈 canary（即使函数无栈缓冲区）。
 *     当栈缓冲区溢出（如 char buf[8]; buf[16]=0 越界写）破坏 canary 时，
 *     程序在函数返回前 __stack_chk_fail abort → 退出码 134 → RE。
 *     性能开销极低（~1-3%），覆盖 gcc 默认 -fstack-protector-strong 之外的
 *     含栈数组的小函数。注意：栈 canary 只在"函数返回时"检测，运行中越界
 *     读写在到达 return 前仍可能产生 UB —— 真正的运行时越界检测需 ASan。
 *   - -D_FORTIFY_SOURCE=2：编译期+运行期检测常见 libc 缓冲区溢出
 *     （memcpy/strcpy/sprintf/memmove 等）。_FORTIFY_SOURCE=2 在 -O2 下生效，
 *     覆盖"已知目标缓冲区大小"的场景。开销极低。需 glibc，Alpine musl libc
 *     也支持（ musl 1.2.0+ 通过 _FORTIFY_SOURCE 宏启用）。仅检测 libc 函数，
 *     不检测数组下标越界 —— 那种场景由 ASan 兜底。
 *
 * Sanitizer 参数（按需启用，运行时检测藏数据题与数组越界）：
 *   - -fsanitize=undefined：UBSan，覆盖有符号整数溢出、整数转换溢出、
 *     除零、空指针解引用、未对齐访问、返回值忽略、变量未初始化读取（部分场景）
 *   - -fsanitize=address：ASan，检测堆/栈数组越界、use-after-free、
 *     栈缓冲区溢出（UBSan 检测不到的场景）。是 OJ 检测"数组越界"的标准方案
 *   - -fno-sanitize-recover=all：触发即终止进程（退出码非0 → RE）
 *   - -fno-omit-frame-pointer：保留帧指针，便于 sanitizer 定位栈
 *   - 两者可同时启用（-fsanitize=address,undefined），但内存/性能开销叠加
 *
 * 重要：-fsanitize=undefined 不能可靠检测所有未初始化读取（如 int a; cout<<a;），
 *   只能检测"a 被使用但从未赋值"的部分场景。完整未初始化检测需
 *   -fsanitize=memory（仅 Clang 支持），当前项目使用 gcc 不适用。
 *   但 UBSan 已能覆盖大部分藏数据题的 UB 场景（溢出/除零/空指针等）。
 *   未初始化读取的兜底检测由 -ftrivial-auto-var-init=pattern 完成（见上），
 *   让脏数据代码稳定判 WA 而非靠运气 AC。
 *
 * 数组越界检测策略：
 *   1. 栈数组越界写破坏 canary → -fstack-protector-all 在函数返回时判 RE（默认开启）
 *   2. 栈/堆数组越界读写 → ASan 在访问时立即判 RE（需 JUDGE_ENABLE_ASAN=true）
 *   3. libc 函数越界 → _FORTIFY_SOURCE=2 在调用时判 RE（默认开启）
 *   生产环境对数组越界有严格要求的题目，可在 docker-compose 设 JUDGE_ENABLE_ASAN=true。
 *   ASan 有 2-5x 性能开销，且内存需调大 memoryLimit × 2-3，故默认不启用。
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
    // 脏数据兜底：未初始化栈变量使用 0xAA pattern，让 UB 代码稳定判 WA
    // 详见函数头注释
    '-ftrivial-auto-var-init=pattern',
    // 有符号整数溢出行为定义为回绕，让溢出代码可预测
    '-fwrapv',
    // 栈 canary：栈缓冲区溢出破坏 canary 时函数返回前 abort → RE
    '-fstack-protector-all',
    // libc 缓冲区溢出检测（memcpy/strcpy 等），运行期触发即 RE
    '-D_FORTIFY_SOURCE=2',
  ]

  // Sanitizer 组合：ASan + UBSan 可同时启用（-fsanitize=address,undefined）
  // - 单独 UBSan：检测 UB（默认开启，Linux+Docker 环境）
  // - 单独 ASan：检测数组越界（需 JUDGE_ENABLE_ASAN=true，性能开销大）
  // - 两者同时：覆盖最全，但内存/性能开销叠加
  if (ENABLE_UBSAN && ENABLE_ASAN) {
    args.push(
      '-fsanitize=address,undefined',
      '-fno-sanitize-recover=all',
      '-fno-omit-frame-pointer'
    )
  } else if (ENABLE_UBSAN) {
    args.push(
      '-fsanitize=undefined',
      '-fno-sanitize-recover=all',
      '-fno-omit-frame-pointer'
    )
  } else if (ENABLE_ASAN) {
    args.push(
      '-fsanitize=address',
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
      // UBSanitizer / ASan 编译时需更大内存：
      //   - UBSan 静态链接开销 ~50MB
      //   - ASan 编译时插桩开销 ~100-200MB
      // 默认 512MB，启用任一 sanitizer 提升至 768MB
      const compileMemMb = (ENABLE_UBSAN || ENABLE_ASAN) ? '768' : '512'
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
