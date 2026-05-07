// 评测执行逻辑
import { JudgeJob, JudgeResult } from './queue'
import { compileCode, CompileResult } from './compiler'
import { executeCode, ExecuteResult } from './executor'
import { validateCodeSafety } from './codeAnalyzer'
import { join } from 'path'
import { logger } from '@/lib/logger'
import { emitJudgeProgress } from '@/lib/websocket/server'

// 比较输出结果 (NOI模式：忽略行末空格和文末换行)
function compareOutput(userOutput: string, expectedOutput: string): boolean {
  // 预处理函数
  const normalize = (str: string) => {
    // 1. 按行分割
    const lines = str.split('\n')
    
    // 2. 去除每一行的行末空格
    const trimmedLines = lines.map(line => line.trimEnd())
    
    // 3. 去除文末的空行
    while (trimmedLines.length > 0 && trimmedLines[trimmedLines.length - 1] === '') {
      trimmedLines.pop()
    }
    
    return trimmedLines.join('\n')
  }

  return normalize(userOutput) === normalize(expectedOutput)
}

// 执行评测
export async function executeJudge(job: JudgeJob): Promise<JudgeResult> {
  const startTime = Date.now()
  
  logger.info(`开始评测提交`, { submissionId: job.submissionId, language: job.language, problemId: job.problemId })
  
  const result: JudgeResult = {
    submissionId: job.submissionId,
    status: 'Judging',
    score: 0,
    time: 0,
    memory: 0,
    passedTests: 0,
    totalTests: job.testCases.length,
    testResults: [],
  }

  try {
    // 第一步: 代码安全分析
    logger.debug(`分析代码安全性`)
    const codeAnalysisResult = validateCodeSafety(job.code, job.language)
    
    if (!codeAnalysisResult.safe) {
      logger.warn(`代码检测到安全问题`)
      return {
        ...result,
        status: 'RE',
        message: codeAnalysisResult.errors[0] || '代码检测到安全问题',
        judgedAt: new Date(),
      }
    }

    logger.debug(`编译代码`)
    const compileResult: CompileResult = await compileCode(job.code, job.language)
    
    if (!compileResult.success) {
      logger.warn(`编译失败`)
      return {
        ...result,
        status: 'CE',
        message: compileResult.error || '编译错误',
        judgedAt: new Date(),
      }
    }

    logger.debug(`编译成功`)

    // 第二步: 运行测试用例
    let maxTime = 0
    let maxMemory = 0

    for (let i = 0; i < job.testCases.length; i++) {
      const testCase = job.testCases[i]
      const currentTest = i + 1
      logger.debug(`测试用例`, { index: currentTest, total: job.testCases.length })

      try {
        emitJudgeProgress(job.userId, {
          submissionId: job.submissionId,
          currentTest,
          totalTests: job.testCases.length,
          status: 'Judging',
        })
        // 执行代码
        const executeResult: ExecuteResult = await executeCode({
          code: job.code,
          language: job.language,
          input: testCase.input,
          timeLimit: testCase.timeLimit || job.timeLimit,
          memoryLimit: testCase.memoryLimit || job.memoryLimit,
          compiledPath: compileResult.compiledPath,
        })

        // 更新最大时间和内存（符合NOI标准）
        maxTime = Math.max(maxTime, executeResult.time)
        maxMemory = Math.max(maxMemory, executeResult.memory)
        
        // 确保时间和内存值为非负数
        maxTime = Math.max(0, maxTime)
        maxMemory = Math.max(0, maxMemory)

        // 判定结果
        let testStatus = 'AC'
        let testMessage = ''

        if (executeResult.timeout) {
          testStatus = 'TLE'
          testMessage = '超出时间限制'
        } else if (executeResult.memoryExceeded) {
          testStatus = 'MLE'
          testMessage = '超出内存限制'
        } else if (executeResult.runtimeError) {
          testStatus = 'RE'
          testMessage = executeResult.error || '运行时错误'
        } else if (!compareOutput(executeResult.output, testCase.output)) {
          testStatus = 'WA'
          testMessage = '答案错误'
        }

        // 记录测试点结果
        result.testResults?.push({
          testId: testCase.id,
          status: testStatus,
          time: executeResult.time,
          memory: executeResult.memory,
          message: testMessage,
        })

        // 如果测试失败，根据题目类型决定是否继续
        if (testStatus === 'AC') {
          result.passedTests++
          result.score += testCase.score
          logger.debug(`通过`, { time: executeResult.time, memory: executeResult.memory })
        } else {
          logger.debug(`测试失败`, { status: testStatus, message: testMessage })
        }
      } catch (error) {
        logger.error(`测试执行错误`, error)
        result.testResults?.push({
          testId: testCase.id,
          status: 'SE',
          time: 0,
          memory: 0,
          message: error instanceof Error ? error.message : '系统错误',
        })
      }
    }

    // 更新总时间和内存
    result.time = maxTime
    result.memory = maxMemory

    // 确定最终状态
    if (result.passedTests === result.totalTests) {
      result.status = 'AC'
      logger.info(`全部通过`)
    } else {
      const failedTest = result.testResults?.find(t => t.status !== 'AC')
      const statusMap: Record<string, 'AC' | 'WA' | 'TLE' | 'MLE' | 'RE' | 'CE' | 'SE'> = {
        WA: 'WA',
        TLE: 'TLE',
        MLE: 'MLE',
        RE: 'RE',
        CE: 'CE',
        SE: 'SE',
      }
      result.status = failedTest?.status ? (statusMap[failedTest.status] || 'WA') : 'WA'
      logger.info(`部分通过`, { passed: result.passedTests, total: result.totalTests })
    }

  } catch (error) {
    logger.error(`评测系统错误`, error)
    result.status = 'SE'
    result.message = error instanceof Error ? error.message : '系统错误'
  }

  const endTime = Date.now()
  logger.info(`评测耗时`, { duration: endTime - startTime })
  
  result.judgedAt = new Date()
  return result
}

// 清理临时文件
export async function cleanup(compiledPath?: string) {
  if (compiledPath) {
    try {
      const fs = await import('fs/promises')
      await fs.unlink(compiledPath)
      logger.debug(`已清理临时文件`, { path: compiledPath })
    } catch (error) {
    }
  }
}

// 清理过期的临时文件
export async function cleanupOldTempFiles() {
  const tempDir = join(process.cwd(), 'temp', 'judge')
  try {
    const fs = await import('fs/promises')
    const path = await import('path')
    
    try {
      await fs.access(tempDir)
    } catch {
      return
    }
    
    const files = await fs.readdir(tempDir, { withFileTypes: true })
    
    const now = Date.now()
    const oneHourAgo = now - 60 * 60 * 1000
    
    for (const file of files) {
      if (file.isFile()) {
        const filePath = path.join(tempDir, file.name)
        try {
          const stats = await fs.stat(filePath)
          
          if (stats.mtime.getTime() < oneHourAgo) {
            await fs.unlink(filePath)
            logger.debug(`已清理过期临时文件`, { filename: file.name })
          }
        } catch (error) {
        }
      }
    }
  } catch (error) {
  }
}
