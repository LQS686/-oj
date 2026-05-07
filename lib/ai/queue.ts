import { EventEmitter } from 'events'
import { logger } from '@/lib/logger'
import { generateProblems, GenerationParams } from './generator'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications'
import { compileCode, cleanup } from '@/lib/judge/compiler'
import { executeCode } from '@/lib/judge/executor'

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
    try {
      // Update DB status to PROCESSING
      await prisma.aiGenerationLog.update({
        where: { id: job.id },
        data: { status: 'PROCESSING' }
      })

      // Call AI
      let { problems, testCases, thought, tokensUsed } = await generateProblems(job.data.params, job.data.userId)

      // ---------------------------------------------------------
      // 🚀 SHARED: Solution Execution for Correct Outputs
      // ---------------------------------------------------------
      let validTestCasesWithStats: any[] = []
      let stats = {
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

            // Solution execution moved above

            // Combine existing and new cases
            const existingCases = targetProblem.testCases.map(tc => ({
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

            // Transactional update
            await prisma.$transaction(async (tx) => {
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
                        isVerified: true,
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
            this.processing.delete(job.id)
            return

        } catch (error: any) {
            logger.error('Test Data Auto-Save Error', error)
            // Fall through to general error handler or handle here
            throw error
        }
      }

      // --- Mode: PARAM_GEN / CLONE / SIMILAR (Create New Problems) ---
      if (job.data.params.mode !== 'test_data') {
          const savedProblems = []
          
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
              // Validate test cases
              const validTestCases = (problem.test_cases || []).map((tc, idx) => ({
                input: tc.input !== undefined ? String(tc.input) : '',
                output: tc.output !== undefined ? String(tc.output) : '',
                isSample: false,
                score: 10,
                orderIndex: idx
              }))

              const newProblem = await prisma.problem.create({
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
                  isPublic: false,
                  visibility: 'private',
                  authorId: job.data.userId,
                  isAiGenerated: true,
                  aiStatus: 'AI_GENERATED',
                  isVerified: false,
                  aiPrompt: JSON.stringify(job.data.params),
                  testCases: {
                    create: validTestCases
                  }
                }
              })
              savedProblems.push(newProblem)
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

          // Update DB with results
          await prisma.aiGenerationLog.update({
            where: { id: job.id },
            data: { 
              status: finalStatus,
              result: {
                problems: savedProblems.length > 0 ? savedProblems : problems,
                thought: thought
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
                content: `已成功生成并入库 ${savedProblems.length} 个题目。`,
                link: '/admin/ai-generation'
            })
          }

          job.status = 'completed'
          this.processing.delete(job.id)
          return
      }
      
      // If we are here, it means mode is 'test_data' but no targetProblemId, which is manual generation (handled by client polling usually, but we should mark complete)
      // Or some other unhandled state.
      // Update log for manual generation (no auto-save)
      await prisma.aiGenerationLog.update({
        where: { id: job.id },
        data: { 
          status: 'COMPLETED',
          result: { testCases: testCases || [], thought } as any,
          tokensUsed: tokensUsed || 0
        }
      })
      
      job.status = 'completed'
      this.processing.delete(job.id)

    } catch (error: any) {
      job.status = 'failed'
      job.error = error.message

      // Update DB with error
      await prisma.aiGenerationLog.update({
        where: { id: job.id },
        data: { 
          status: 'FAILED',
          error: error.message
        }
      })

      this.processing.delete(job.id)
    }
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
