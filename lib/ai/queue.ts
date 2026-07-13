import { EventEmitter } from 'events'
import { logger } from '@/lib/logger'
import type { GenerationParams } from './generator';
import { generateProblems } from './generator'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notification/service'
import { compileCode, cleanup } from '@/lib/judge/compiler'
import { executeCode } from '@/lib/judge/executor'
import { ensureTotalScoreIs100 } from '@/lib/problem/testcase'
import { validateCodeSafety } from '@/lib/judge/codeAnalyzer'

// problemNumber 竞态修复：unique 冲突时重试
async function createProblemWithRetry(data: any, maxRetries = 3): Promise<any> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await prisma.problem.create({ data })
    } catch (e: any) {
      if (e?.code === 'P2002' && attempt < maxRetries - 1) {
        // unique 冲突，重新查询最大 problemNumber
        const latest = await prisma.problem.findFirst({
          where: { problemNumber: { startsWith: 'P' } },
          orderBy: { createdAt: 'desc' },
          select: { problemNumber: true },
        })
        let nextNum = 1001
        if (latest?.problemNumber) {
          const match = latest.problemNumber.match(/^P(\d+)$/)
          if (match) {
            nextNum = parseInt(match[1], 10) + 1
          }
        }
        data.problemNumber = `P${nextNum}`
        logger.warn(`[problemNumber] unique 冲突，重试 ${attempt + 1}/${maxRetries}`, { nextNum: data.problemNumber })
        continue
      }
      throw e
    }
  }
  // 理论上不可达（循环要么 return 要么 throw）
  throw new Error('createProblemWithRetry: exhausted retries')
}

interface AiJob {
  logId: string
  userId: string
  params: GenerationParams
}

type JobStatus = 'waiting' | 'active' | 'completed' | 'failed'

interface QueuedJob {
  id: string
  data: AiJob
  status: JobStatus
  error?: string
  createdAt: Date
  startedAt?: Date
  completedAt?: Date
  /**
   * 超时标志：executeJob 用 Promise.race 实现超时，但 _executeJobInner 的 Promise
   * 无法真正取消。超时后 catch 设置 aborted=true，_executeJobInner 在关键写库点
   * （status='COMPLETED' 之前）检查此标志并 return，避免把已被 catch 标为 FAILED
   * 的日志状态覆盖回 COMPLETED。
   */
  aborted: boolean
}

class AiQueue extends EventEmitter {
  private queue: QueuedJob[] = []
  private processing: Map<string, QueuedJob> = new Map()
  private maxConcurrent: number = 2 // Limit concurrent AI requests
  private isProcessing: boolean = false

  constructor() {
    super()
  }

  async add(data: AiJob): Promise<string> {
    const job: QueuedJob = {
      id: data.logId,
      data,
      status: 'waiting',
      createdAt: new Date(),
      aborted: false,
    }

    this.queue.push(job)
    this.emit('waiting', job.id)
    
    if (!this.isProcessing) {
      this.processQueue()
    }

    return job.id
  }

  private async processQueue() {
    if (this.isProcessing) return
    this.isProcessing = true

    while (this.queue.length > 0 || this.processing.size > 0) {
      while (this.queue.length > 0 && this.processing.size < this.maxConcurrent) {
        const job = this.queue.shift()!
        job.status = 'active'
        job.startedAt = new Date()
        this.processing.set(job.id, job)
        
        this.executeJob(job).catch((error) => {
          logger.error(`AI Task Error: ${job.id}`, error)
        })
      }
      
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    this.isProcessing = false
  }

  private async executeJob(job: QueuedJob) {
    const AI_JOB_TIMEOUT_MS = parseInt(process.env.AI_JOB_TIMEOUT_MS || '300000', 10) // 默认 5 分钟
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    try {
      // 主逻辑包装为 Promise.race + 超时，避免 AI 任务长时间挂起阻塞队列
      await Promise.race([
        this._executeJobInner(job),
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('AI 任务执行超时')), AI_JOB_TIMEOUT_MS)
        })
      ])
    } catch (error: any) {
      // 标记 aborted，让 _executeJobInner 在后续写库点跳过 COMPLETED 覆盖
      job.aborted = true
      job.status = 'failed'
      job.error = error.message

      // 透传 AI_PARSE_FAILED 错误代码到日志，让前端能识别并友好提示
      const isParseError = error?.code === 'AI_PARSE_FAILED'
      const errorMessage = isParseError
        ? `AI 返回格式异常：${error.message}。建议：重试 / 切换模型 / 降低 temperature`
        : error.message

      // Update DB with error
      await prisma.aiGenerationLog.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          error: errorMessage,
          result: isParseError ? {
            parseFailed: true,
            parseInfo: error?.info || null,
            originalContent: error?.info?.originalContent
          } as any : undefined
        }
      })
    } finally {
      // 确保 processing Map 总是被清理（即使超时或异常）
      if (timeoutId) clearTimeout(timeoutId)
      this.processing.delete(job.id)
    }
  }

  private async _executeJobInner(job: QueuedJob) {
      // Update DB status to PROCESSING
      await prisma.aiGenerationLog.update({
        where: { id: job.id },
        data: { status: 'PROCESSING' }
      })

      // Call AI
      let { problems, testCases, thought, tokensUsed, qualityIssues } = await generateProblems(job.data.params, job.data.userId)

      // ---------------------------------------------------------
      // 🚀 SHARED: Solution Execution for Correct Outputs
      // ---------------------------------------------------------
      const validTestCasesWithStats: any[] = []
      const stats = {
          total: 0,
          passed: 0,
          failed: 0,
          avgTime: 0,
          avgMemory: 0
      }

      if (job.data.params.mode === 'test_data' && testCases && job.data.params.solutionCode && job.data.params.solutionLanguage) {
          logger.info('Detected Solution Code, running to generate outputs...')
          const { solutionCode, solutionLanguage } = job.data.params
          
          // 1. Compile Solution
          const compileResult = await compileCode(solutionCode, solutionLanguage)
          if (!compileResult.success) {
              throw new Error(`Solution Compilation Failed: ${compileResult.error || compileResult.stderr}`)
          }

          try {
              // 2. Run Solution against each AI generated input
              let totalTime = 0
              let totalMemory = 0
              
              stats.total = testCases.length

              for (let i = 0; i < testCases.length; i++) {
                  const tc = testCases[i]
                  // Ensure input is a string
                  const input = typeof tc.input === 'string' ? tc.input : String(tc.input)
                  
                  logger.info(`Running solution for test case #${i + 1}`)
                  try {
                      const result = await executeCode({
                          code: solutionCode,
                          language: solutionLanguage,
                          input: input,
                          timeLimit: 2000, // 2s default for generation
                          memoryLimit: 256, // 256MB default
                          compiledPath: compileResult.compiledPath
                      })

                      if (result.timeout) {
                           logger.warn(`Solution TLE on generated input #${i + 1}, skipping.`)
                           stats.failed++
                           continue
                      }
                      if (result.runtimeError) {
                           logger.warn(`Solution Runtime Error on generated input #${i + 1}: ${result.error}, skipping.`)
                           stats.failed++
                           continue
                      }
                      if (result.exitCode !== 0) {
                           logger.warn(`Solution Non-zero Exit Code on generated input #${i + 1}, skipping.`)
                           stats.failed++
                           continue
                      }
                      
                      // Success
                      stats.passed++
                      totalTime += result.time
                      totalMemory += result.memory

                      // Overwrite the AI output with the actual calculated output
                      // Trim whitespace to ensure clean comparison
                      tc.output = result.output.trim()
                      
                      // Store valid case with run stats
                      validTestCasesWithStats.push({
                          ...tc,
                          _stats: { time: result.time, memory: result.memory }
                      })

                  } catch (execErr) {
                      logger.error(`Execution error on case #${i+1}`, execErr)
                      stats.failed++
                  }
              }
              
              if (stats.passed > 0) {
                  stats.avgTime = Math.round(totalTime / stats.passed)
                  stats.avgMemory = Math.round(totalMemory / stats.passed)
              }

          } finally {
              // 3. Cleanup compiled files
              await cleanup(compileResult.compiledPath)
          }
          
          // Replace original testCases with only valid ones
          testCases = validTestCasesWithStats
          
          if (testCases.length === 0) {
              throw new Error(`All ${stats.total} generated test cases failed validation against the solution code. Please check your solution or retry.`)
          }
      }

      // --- Mode: TEST_DATA_GEN with targetProblemId ---
      if (job.data.params.mode === 'test_data' && job.data.params.targetProblemId && testCases) {
        const problemId = job.data.params.targetProblemId
        
        try {
            // Check if problem exists
            const targetProblem = await prisma.problem.findUnique({
                where: { id: problemId },
                include: { testCases: true }
            })

            if (!targetProblem) {
                throw new Error(`Target problem not found: ${problemId}`)
            }

            // Combine existing and new cases
            const existingCases = targetProblem.testCases.map((tc: any) => ({
                input: tc.input,
                output: tc.output,
                isSample: tc.isSample,
            }))

            const newCasesFormatted = testCases.map(tc => ({
                input: tc.input !== undefined ? String(tc.input) : '',
                output: tc.output !== undefined ? String(tc.output) : '',
                isSample: false,
            }))

            const allCases = [...existingCases, ...newCasesFormatted]
            
            // Distribute scores
            const totalCases = allCases.length
            const baseScore = Math.floor(100 / totalCases)
            const remainder = 100 % totalCases
            
            const finalCases = allCases.map((tc, idx) => ({
                problemId,
                input: tc.input,
                output: tc.output,
                isSample: tc.isSample,
                score: baseScore + (idx < remainder ? 1 : 0),
                orderIndex: idx
            }))

            // 超时保护：若 executeJob 已因超时把日志标 FAILED，则跳过后续写库，避免覆盖状态
            if (job.aborted) return

            // Transactional update
            await prisma.$transaction(async (tx: any) => {
                // Delete old cases
                await tx.testCase.deleteMany({
                    where: { problemId }
                })

                if (finalCases.length > 0) {
                    await tx.testCase.createMany({
                        data: finalCases
                    })
                }

                // Update Problem Status
                await tx.problem.update({
                    where: { id: problemId },
                    data: {
                        aiStatus: 'AI_ASSISTED',
                        stdCode: job.data.params.solutionCode,
                        stdLang: job.data.params.solutionLanguage
                    } as any
                })

                // Update Log
                await tx.aiGenerationLog.update({
                    where: { id: job.id },
                    data: {
                        status: 'COMPLETED',
                        result: {
                            testCases: newCasesFormatted, // Return only new cases in result for log visibility
                            thought,
                            stats: stats.total > 0 ? stats : undefined
                        } as any,
                        tokensUsed: tokensUsed || 0
                    }
                })
            })

            // Notify User with detailed report
            const report = stats.total > 0 
                ? `\n生成统计: 总数 ${stats.total}, 通过 ${stats.passed}, 失败 ${stats.failed}, 平均耗时 ${stats.avgTime}ms`
                : '';

            await createNotification({
                userId: job.data.userId,
                type: 'system',
                title: 'AI 测试数据生成完成',
                content: `题目 "${targetProblem.title}" 的 ${newCasesFormatted.length} 组测试数据已生成并自动入库。` + 
                         (job.data.params.solutionCode ? ` (基于标程验证)${report}` : ''),
                link: `/admin/problems/${problemId}/testcases`
            })

            job.status = 'completed'
            return

        } catch (error: any) {
            logger.error('Test Data Auto-Save Error', error)
            throw error
        }
      }

      // --- Mode: PARAM_GEN (Create New Problems) ---
      if (job.data.params.mode !== 'test_data') {
          const savedProblems = []
          // 每道题目的测试点 output 修正统计，最终聚合写入 aiGenerationLog.result.correctionStats
          const correctionStatsList: any[] = []
          // 每道题目的题解创建结果（'created' | 'missing' + problemNumber / solutionId）
          const solutionResults: Array<{
            problemNumber: string
            status: 'created' | 'missing'
            solutionId?: string
          }> = []

          // 1. Get next problem number start
          // Use createdAt desc to find the latest problem, as string sorting of "P10000" < "P9999" is incorrect
          const latestProblem = await prisma.problem.findFirst({
            where: { problemNumber: { startsWith: 'P' } },
            orderBy: { createdAt: 'desc' },
            select: { problemNumber: true }
          })
          
          let nextNumber = 1001
          if (latestProblem?.problemNumber) {
            const match = latestProblem.problemNumber.match(/^P(\d+)$/)
            if (match) {
              nextNumber = parseInt(match[1], 10) + 1
            }
          }

          // 2. Save problems
          const errors: string[] = []
          
          for (const problem of problems) {
            const problemNumber = `P${nextNumber}`

            try {
              // AI 输出的 score 不可信，统一归一化到总和 100
              // （即使 AI 给了 score=10 也重新均分，避免最终总分 != 100）
              const rawTestCases = problem.test_cases || []
              if (rawTestCases.length < 10) {
                logger.warn('[ai-queue] AI 生成的测试点偏少（< 10 组）', {
                  problemTitle: problem.title,
                  testCaseCount: rawTestCases.length,
                  hint: '可能 max_tokens 不够或 prompt 未生效；考虑重启 dev server 重试'
                })
              }
              const validTestCases = ensureTotalScoreIs100(
                rawTestCases.map((tc, idx) => ({
                  input: tc.input !== undefined ? String(tc.input) : '',
                  output: tc.output !== undefined ? String(tc.output) : '',
                  isSample: false,
                  score: 10,
                  orderIndex: idx
                }))
              )

              // ---------------------------------------------------------
              // 🚀 用标程帮助修正测试点 output
              // 业务决策（2026-06）：AI 推断的 output 不可信，必须真实运行标程覆盖
              // 复用 test_data 模式已有的 compileCode / executeCode / cleanup helper
              // - 优先 solution_cpp，缺失时回退 solution_python
              // - 编译失败 / 无标程 / 安全检查失败：跳过修正，保留 AI 原 output
              // - 单点失败（TLE/RE/非零退出）：跳过该点，保留 AI 原 output
              // - 成功：用 result.output.trim() 覆盖
              // ---------------------------------------------------------
              let correctionStats: any
              const hasSolutionCpp = typeof problem.solution_cpp === 'string' && (problem.solution_cpp as string).trim().length > 0
              const hasSolutionPython = typeof problem.solution_python === 'string' && (problem.solution_python as string).trim().length > 0
              const stdCode: string | null = hasSolutionCpp
                ? (problem.solution_cpp as string)
                : hasSolutionPython
                  ? (problem.solution_python as string)
                  : null
              const stdLang: 'cpp' | 'python' | null = hasSolutionCpp
                ? 'cpp'
                : hasSolutionPython
                  ? 'python'
                  : null

              if (!stdCode || !stdLang) {
                // 无标程可用
                correctionStats = { skipped: 'no_solution' }
                logger.info('[ai-queue] 无标程可用，跳过测试点 output 修正', {
                  problemTitle: problem.title,
                  hasCpp: hasSolutionCpp,
                  hasPython: hasSolutionPython
                })
              } else {
                // 安全预检（如可用）
                let unsafe: string | null = null
                try {
                  const safety = validateCodeSafety(stdCode, stdLang)
                  if (!safety.safe) {
                    unsafe = (safety as any).reason || (safety as any).message || 'unsafe_code'
                  }
                } catch (e) {
                  // 预检函数不可用 / 异常时降级为不预检，不阻塞主流程
                  logger.warn('[ai-queue] validateCodeSafety 不可用，跳过安全预检', e)
                }

                if (unsafe) {
                  correctionStats = { skipped: 'unsafe_code', reason: unsafe }
                  logger.warn('[ai-queue] 标程安全预检未通过，跳过 output 修正', {
                    problemTitle: problem.title,
                    language: stdLang,
                    reason: unsafe
                  })
                } else {
                  // 编译标程
                  const compileResult = await compileCode(stdCode, stdLang)
                  if (!compileResult.success) {
                    correctionStats = {
                      skipped: 'compile_failed',
                      compileError: compileResult.error || compileResult.stderr || 'unknown'
                    }
                    logger.warn('[ai-queue] 标程编译失败，跳过 output 修正', {
                      problemTitle: problem.title,
                      language: stdLang,
                      compileError: correctionStats.compileError
                    })
                  } else {
                    // 编译成功：跑每个 test case
                    let totalTime = 0
                    let totalMemory = 0
                    let passed = 0
                    let failed = 0
                    const total = validTestCases.length

                    try {
                      for (let i = 0; i < validTestCases.length; i++) {
                        const tc: any = validTestCases[i]
                        const input = typeof tc.input === 'string' ? tc.input : String(tc.input || '')

                        try {
                          const result = await executeCode({
                            code: stdCode,
                            language: stdLang,
                            input,
                            timeLimit: 2000,
                            memoryLimit: 256,
                            compiledPath: compileResult.compiledPath
                          })

                          if (result.timeout) {
                            logger.warn(`[ai-queue] 标程在测试点 #${i + 1} 超时，保留 AI 原 output`, {
                              problemTitle: problem.title
                            })
                            failed++
                            continue
                          }
                          if (result.runtimeError) {
                            logger.warn(`[ai-queue] 标程在测试点 #${i + 1} 运行时错误，保留 AI 原 output`, {
                              problemTitle: problem.title,
                              error: result.error
                            })
                            failed++
                            continue
                          }
                          if (result.exitCode !== 0) {
                            logger.warn(`[ai-queue] 标程在测试点 #${i + 1} 非零退出 (exitCode=${result.exitCode})，保留 AI 原 output`, {
                              problemTitle: problem.title
                            })
                            failed++
                            continue
                          }

                          passed++
                          totalTime += result.time || 0
                          totalMemory += result.memory || 0

                          // 覆盖 AI 推断的 output（trim 处理，避免末尾空行/空格污染）
                          tc.output = (result.output || '').trim()
                        } catch (execErr) {
                          logger.error(`[ai-queue] 测试点 #${i + 1} 执行异常，保留 AI 原 output`, {
                            problemTitle: problem.title,
                            err: execErr
                          })
                          failed++
                        }
                      }
                    } finally {
                      await cleanup(compileResult.compiledPath)
                    }

                    correctionStats = {
                      total,
                      passed,
                      failed,
                      corrected: passed,
                      avgTime: passed > 0 ? Math.round(totalTime / passed) : 0,
                      avgMemory: passed > 0 ? Math.round(totalMemory / passed) : 0
                    }

                    logger.info('[ai-queue] 测试点 output 修正完成', {
                      problemTitle: problem.title,
                      ...correctionStats
                    })
                  }
                }
              }
              // 把统计推入数组，用于写入 aiGenerationLog.result.correctionStats
              correctionStatsList.push(correctionStats)
              // ---------------------------------------------------------
              // END 标程修正 output
              // ---------------------------------------------------------

              const newProblem = await createProblemWithRetry({
                data: {
                  problemNumber,
                  title: problem.title || 'Untitled AI Problem',
                  description: problem.description || '',
                  input: problem.input || '',
                  output: problem.output || '',
                  samples: problem.samples || [],
                  hint: problem.hint,
                  difficulty: problem.difficulty || '入门',
                  tags: Array.isArray(problem.tags) ? problem.tags : [],
                  timeLimit: problem.time_limit || 1000,
                  memoryLimit: problem.memory_limit || 128,
                  // 业务决策（2026-06）：AI 生成的题目不需要人工验证，直接加入公开题库
                  // 质量门禁（2026-07）：存在 qualityIssues 时降级为 private，需人工复核
                  isPublic: !qualityIssues?.length,
                  visibility: qualityIssues?.length ? 'private' : 'public',
                  authorId: job.data.userId,
                  isAiGenerated: true,
                  aiStatus: 'AI_GENERATED',
                  aiPrompt: JSON.stringify(job.data.params),
                  // 保存标程，便于后续测试数据生成 / output 修正复用
                  stdCode,
                  stdLang,
                  testCases: {
                    create: validTestCases
                  }
                }
              })
              savedProblems.push(newProblem)

              // ---------------------------------------------------------
              // 🚀 直接写 Solution 题解（合并到 AI 出题单次调用）
              // 业务决策（2026-06）：单次 AI 调用同时返回题目 + 题解，
              // 不再调 enqueueSolutionJob 走第 2 段链路（避免"2 个任务"）
              // - AI 输出的 solution_article 字段直接作为 Solution.content
              // - 同题同源（sourceType='AI_OFFICIAL'）的旧记录先 deleteMany
              // - 题解缺失时仅 log warning，不阻断主流程（Problem 已入库）
              // ---------------------------------------------------------
              let solutionResult: {
                problemNumber: string
                status: 'created' | 'missing'
                solutionId?: string
              } = { problemNumber, status: 'missing' }

              try {
                const article = typeof problem.solution_article === 'string' ? problem.solution_article.trim() : ''
                if (!article) {
                  logger.warn('[ai-queue] AI 返回的 solution_article 缺失，跳过题解创建', {
                    problemId: newProblem.id,
                    problemNumber: newProblem.problemNumber
                  })
                } else {
                  // 决定 code / codeLanguage（与之前 enqueueSolutionJob 的策略一致）
                  const code: string | null = problem.solution_cpp
                    ? String(problem.solution_cpp)
                    : problem.solution_python
                      ? String(problem.solution_python)
                      : null
                  const codeLanguage: 'cpp' | 'python' | null = problem.solution_cpp
                    ? 'cpp'
                    : problem.solution_python
                      ? 'python'
                      : null

                  // 事务保证：清理旧 AI 标程题解 + 创建新题解原子完成
                  // （避免 deleteMany 后 create 失败导致题解丢失）
                  const solution = await prisma.$transaction(async (tx: any) => {
                    // 清理同题同源的旧 AI 标程题解（保持"同题只有一份 AI_OFFICIAL"）
                    await tx.solution.deleteMany({
                      where: {
                        problemId: newProblem.id,
                        sourceType: 'AI_OFFICIAL'
                      } as any
                    })

                    return await tx.solution.create({
                      data: {
                        problemId: newProblem.id,
                        authorId: job.data.userId,
                        title: `AI 标程题解 - ${newProblem.title}`,
                        content: article,
                        code: code || null,
                        codeLanguage: codeLanguage || null,
                        isOfficial: true,
                        isAiGenerated: true,
                        sourceType: 'AI_OFFICIAL'
                      } as any
                    })
                  })

                  solutionResult = {
                    problemNumber,
                    status: 'created',
                    solutionId: solution.id
                  }

                  logger.info('[ai-queue] 题解随题目同步创建', {
                    problemId: newProblem.id,
                    problemNumber: newProblem.problemNumber,
                    solutionId: solution.id,
                    contentLength: article.length
                  })
                }
              } catch (e) {
                // 题解创建失败不阻断主流程（题目已入库）
                logger.error('[ai-queue] 题解随题目同步创建失败', {
                  problemId: newProblem.id,
                  problemNumber: newProblem.problemNumber,
                  err: e
                })
              }
              solutionResults.push(solutionResult)
              // ---------------------------------------------------------
              // END 同步写题解
              // ---------------------------------------------------------

              nextNumber++
            } catch (saveError: any) {
              logger.error(`Failed to save AI problem: ${problem.title}`, saveError)
              errors.push(`Save failed for "${problem.title}": ${saveError.message}`)
            }
          }

          // Determine final status
          let finalStatus = 'COMPLETED'
          let finalError = undefined
          
          if (savedProblems.length === 0 && problems.length > 0) {
            finalStatus = 'FAILED'
            finalError = errors.length > 0 ? errors.join('; ') : 'Failed to save any problems to database'
          } else if (errors.length > 0) {
            // Partial success
            finalError = `Partial success. Errors: ${errors.join('; ')}`
          }

          // 超时保护：跳过 COMPLETED 写库，避免覆盖已被 catch 标记的 FAILED 状态
          if (job.aborted) return

          // Update DB with results
          await prisma.aiGenerationLog.update({
            where: { id: job.id },
            data: {
              status: finalStatus,
              result: {
                problems: savedProblems.length > 0 ? savedProblems : problems,
                thought: thought,
                // 每道题目的测试点 output 修正统计（来自 PARAM_GEN 路径的标程执行）
                correctionStats: correctionStatsList,
                // 每道题目的题解创建结果（created = 题解已写库；missing = AI 未返回题解，可手动重生成）
                solutionStatus: solutionResults
              } as any,
              tokensUsed: tokensUsed || 0,
              error: finalError
            }
          })

          // Notify User
          if (finalStatus === 'COMPLETED') {
             await createNotification({
                userId: job.data.userId,
                type: 'system',
                title: 'AI 题目生成完成',
                content: `已成功生成并发布到公开题库 ${savedProblems.length} 个题目。`,
                link: '/admin/ai-generation'
            })
          }

          job.status = 'completed'
          return
      }
      
      // If we are here, it means mode is 'test_data' but no targetProblemId, which is manual generation (handled by client polling usually, but we should mark complete)
      // Or some other unhandled state.
      // Update log for manual generation (no auto-save)
      // 注：剥离 _stats 字段，避免内部执行的统计信息污染 log.result
      const cleanTestCases = (testCases || []).map(({ input, output }: any) => ({
        input: input !== undefined ? String(input) : '',
        output: output !== undefined ? String(output) : ''
      }))
      // 超时保护：跳过 COMPLETED 写库，避免覆盖已被 catch 标记的 FAILED 状态
      if (job.aborted) return
      await prisma.aiGenerationLog.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          result: { testCases: cleanTestCases, thought } as any,
          tokensUsed: tokensUsed || 0
        }
      })
      
      job.status = 'completed'
  }
}

// Global instance
declare global {
  var __aiQueue: AiQueue | undefined
}

export const aiQueue = global.__aiQueue ?? new AiQueue()

if (!global.__aiQueue) {
  global.__aiQueue = aiQueue
}

export async function addAiJob(data: AiJob) {
  return aiQueue.add(data)
}
