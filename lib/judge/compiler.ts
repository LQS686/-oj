// 代码编译器：接收选手源代码，通过 runner.sh 沙箱编译，返回编译产物路径或错误信息
import { writeFile, mkdir, unlink } from 'fs/promises'
import { spawn } from 'child_process'
import { join } from 'path'
import { existsSync } from 'fs'
import * as crypto from 'crypto'
import { logger } from '@/lib/logger'
import { CompileState } from './types'
import { getJudgeConfig } from './config'
import {
  compileCacheKey,
  acquireCompileCache,
  putCompileCache,
} from './compile-cache'

export interface CompileResult {
  success: boolean
  compileState: CompileState
  compiledPath?: string
  error?: string
  stderr?: string
  /** 产物由编译缓存管理（C/C++ 编译成功）；调用方评测结束应 releaseCompileCache(cacheKey) 而非删除产物 */
  cacheKey?: string
  /** 是否命中编译缓存（复用等价产物，未重新编译） */
  fromCache?: boolean
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
//   - 未设置：默认关闭（对齐洛谷 / HOJ / Hydro 教学 OJ 计时）
//
// 启用后：
//   - 编译时加 -fsanitize=undefined -fno-sanitize-recover=all
//   - 运行时需链接 libubsan（glibc 发行版 gcc 常可静态链接；Alpine/musl 无此库，勿在 Alpine 上强制开启）
//   - UBSanitizer 有 2-3x 内存开销，需相应调大 memoryLimit
//
// 竞赛严检可设 JUDGE_ENABLE_UBSAN=true（建议与 ASan 一并开启）。
const ENABLE_UBSAN = (() => {
  const flag = process.env.JUDGE_ENABLE_UBSAN
  if (flag === 'true') return true
  if (flag === 'false') return false
  // 默认关闭：教学 OJ 计时接近洛谷；严检显式开
  return false
})()

// JUDGE_ENABLE_ASAN 环境变量控制是否启用 AddressSanitizer（-fsanitize=address）：
//   - 'true'：强制启用（需 libasan，Linux gcc 默认提供）
//   - 'false'：强制禁用
//   - 未设置：默认关闭（对齐洛谷 / HOJ / Hydro；避免 2–5× 减速与 shadow 内存）
//
// 启用后：
//   - 编译时加 -fsanitize=address -fno-sanitize-recover=all
//   - 检测：堆/栈数组越界、use-after-free、栈缓冲区溢出（UBSan 检测不到的场景）
//   - 与 UBSan 可同时启用（-fsanitize=address,undefined）
//   - 内存开销：评测时实际内存 = 题目 memoryLimit × 2-3，需相应调大 memoryLimit
//   - 性能开销：2-5x 减速；且与 ulimit -v 不兼容
//
// 教学型 OJ（洛谷/HOJ/Hydro）默认不开 sanitizer，依赖测试数据判 WA。
// 竞赛严检（Codeforces / AtCoder 风格）请显式设 JUDGE_ENABLE_ASAN=true，
// 并把题目 memoryLimit 调至 256MB+。
// Linux 无 ASan 时仍靠 -ftrivial-auto-var-init / stack-protector / FORTIFY。
const ENABLE_ASAN = (() => {
  const flag = process.env.JUDGE_ENABLE_ASAN
  if (flag === 'true') return true
  if (flag === 'false') return false
  return false
})()

/** 供 executor 决定是否对 runner 启用 ulimit -v（ASan 开启时不可用） */
export function isJudgeAsanEnabled(): boolean {
  return ENABLE_ASAN
}

/**
 * 是否对选手进程启用 ulimit -v（RLIMIT_AS 硬限虚拟内存）
 * B-P1-5：仅编译型语言（C/C++）启用。解释型语言（Python 等）的解释器
 * VmSize 基础占用大（解释器 + 内建模块 mmap），RLIMIT_AS 过小会
 * 让「小内存题目」的解释器启动即崩（SIGKILL → 误判 MLE/RE）。
 */
export function shouldForceUlimitV(language?: string): boolean {
  if (ENABLE_ASAN) return false
  return language === 'cpp' || language === 'c'
}
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
 *       3. 即使未启用 UBSan，也能让脏读更稳定地 WA
 *     这是 gcc 下检测未初始化读取 UB 的有效方案。
 *     需要 gcc 12+，Alpine 3.18+ / Debian 12+ 的 gcc 均已支持。
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
function buildStableCompileArgs(
  compiler: 'g++' | 'gcc',
  std: string,
): string[] {
  const args = [
    '-O2',
    // 不使用 -march=native：Intel Xeon 启用 AVX-512 后会触发降频保护，
    // 反而比 SSE2 慢 20%+。保持默认 -march（x86-64 SSE2）最稳定。
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
  // - 默认均关闭（洛谷式计时）；JUDGE_ENABLE_*=true 显式开启
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

  // compiler 作为返回值的一部分供调用方使用
  void compiler
  return args
}

function buildCompileArgs(
  compiler: 'g++' | 'gcc',
  std: string,
  sourcePath: string,
  outputPath: string
): string[] {
  return [...buildStableCompileArgs(compiler, std), '-o', outputPath, sourcePath]
}

/** 构造 compileCommand 字符串（仅用于 languageConfigs.compileCommand 字段展示） */
function buildCompileCommand(compiler: 'g++' | 'gcc', std: string, source: string, output: string): string {
  return `${compiler} ${buildCompileArgs(compiler, std, source, output).join(' ')}`
}

/** 净化编译进程环境：禁止继承应用环境，避免 g++ 读到 JWT_SECRET 等敏感变量 */
function compileSpawnEnv(cwd: string): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
    HOME: cwd,
    TMPDIR: cwd,
    LANG: process.env.LANG || 'C.UTF-8',
    TZ: process.env.TZ || 'UTC',
    NODE_ENV: 'production',
  }
}

/**
 * 使用 spawn 执行编译命令，收集 stdout/stderr/exitCode
 *
 * 重要：必须使用 spawn 而非 exec！
 * - exec 在 Alpine Linux 上存在 shell 解析问题，且 maxBuffer 限制可能导致截断
 * - spawn 直接调用命令数组，不经过 shell，更可靠且安全
 * - 切勿改回 exec，否则评测编译会静默失败（exitCode=1，stderr 为空）
 */
function spawnCompile(
  cmd: string,
  args: string[],
  timeoutMs: number,
  env: NodeJS.ProcessEnv = compileSpawnEnv(process.cwd()),
): Promise<{ exitCode: number; stdout: string; stderr: string; timedOut?: boolean }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { timeout: timeoutMs, env })
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
      // B-P2-10：Node timeout 以 SIGTERM 终止（code=null），须与「编译器正常退出码 1」区分，
      // 否则编译超时会被误报成编译错误（CE）
      const timedOut = code === null && signal === 'SIGTERM'
      resolve({ exitCode: code ?? 1, stdout, stderr, timedOut })
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

  // 编译产物缓存：C/C++ 相同代码命中时直接复用产物（避免重复 g++ 编译）
  let cacheKey: string | undefined
  if (config.needsCompile) {
    const compiler = language === 'c' ? 'gcc' : 'g++'
    const std = language === 'c' ? 'c11' : 'c++17'
    cacheKey = compileCacheKey(
      language,
      code,
      buildStableCompileArgs(compiler as 'g++' | 'gcc', std),
      compiler,
    )
    const hit = acquireCompileCache(cacheKey, code)
    if (hit) {
      logger.debug('编译缓存命中', { language, cacheKey })
      return {
        success: true,
        compileState: CompileState.CompileSuccessfully,
        compiledPath: hit.compiledPath,
        cacheKey,
        fromCache: true,
      }
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

    const outputPath = join(tempDir, compiledBasename)

    // B-P2-9：净化编译进程环境，不继承 JWT_SECRET 等应用敏感变量
    const compileEnv = compileSpawnEnv(tempDir)

    // 编译统一走 runner.sh 沙箱（限制内存/CPU/栈/文件描述符）
    const isLinux = process.platform === 'linux'
    const useSandbox = isLinux

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
      // 默认 512MB；启用 sanitizer 时编译期内存显著更高，提到 2048MB
      const compileMemMb = (ENABLE_UBSAN || ENABLE_ASAN) ? '2048' : '512'
      const compiler = language === 'c' ? 'gcc' : 'g++'
      const std = language === 'c' ? 'c11' : 'c++17'
      // 编译参数（不含 compiler 名称，由 runner.sh 单独传）
      const compileArgs = buildCompileArgs(compiler as 'g++' | 'gcc', std, sourcePath, outputPath)
      // B-P2-11：编译内存限制（runner.sh 的 $1）真实生效——runner.sh 仅在
      // DSOJ_FORCE_ULIMIT_V=1 时才执行 ulimit -v $((MEM_MB * 1024))。
      // 编译期 g++ 非 ASan 二进制，不受「ASan 与 ulimit -v 不兼容」限制
      // （sanitizer 模式编译内存上限已提至 2048MB，见上）。
      compileEnv.DSOJ_FORCE_ULIMIT_V = '1'
      spawnCmd = 'bash'
      spawnArgs = [runnerPath, compileMemMb, '15', '64', compiler, ...compileArgs]
    } else {
      // 非 Linux 宿主（如 Windows 开发）：直接调用编译器，无 runner.sh 沙箱保护
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
      const { exitCode, stderr, timedOut } = await spawnCompile(
        spawnCmd,
        spawnArgs,
        getJudgeConfig().compileTimeoutMs,
        compileEnv,
      )

      if (exitCode === 0) {
        // 编译成功：写入缓存并占用引用，供后续相同代码复用；评测结束由调用方 release
        let finalCompiledPath = outputPath
        if (cacheKey) {
          putCompileCache(cacheKey, {
            compiledPath: outputPath,
            sourceExt: config.extension,
            code,
          })
          const acquired = acquireCompileCache(cacheKey, code)
          if (acquired) {
            if (acquired.compiledPath !== outputPath) {
              // 并发编译相同代码：已有条目在用，复用其产物，清理本次编译的孤儿产物 + 源文件
              await unlink(outputPath).catch(() => {})
              await unlink(sourcePath).catch(() => {})
            }
            finalCompiledPath = acquired.compiledPath
          }
        }
        return {
          success: true,
          compileState: CompileState.CompileSuccessfully,
          compiledPath: finalCompiledPath,
          stderr: stderr || undefined,
          cacheKey,
          fromCache: false,
        }
      }

      const ext = config.extension.substring(1)
      const filteredStderr = filterCompileError(stderr, ext)

      // B-P2-10：编译超时（Node 兜底 SIGTERM 终止 或 runner 内 SIGXCPU=152）→
      // CompileTimeLimitExceeded，而非 CompileError，便于区分「代码编译不过」与「编译资源超限」；
      // 前端状态仍为 CE（CompileState 仅影响 message 前缀），保持兼容。
      if (timedOut || exitCode === 152) {
        logger.warn(`编译超时`, { exitCode, cmd: spawnCmd, args: spawnArgs })
        return {
          success: false,
          compileState: CompileState.CompileTimeLimitExceeded,
          error: '编译超时',
          stderr: filteredStderr,
        }
      }

      // 编译失败
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
