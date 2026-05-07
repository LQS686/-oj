
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { GeneratedProblem } from '@/lib/ai/prompts/core/types'
import { redistributeTestScores } from '@/lib/testcase-score'

export async function POST(request: NextRequest) {
  try {
    const user = getUserFromRequest(request)
    if (!user || !user.isAdmin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 })
    }

    const body = await request.json()
    const { problems, logId } = body // Expect an array of problems to save

    if (!problems || !Array.isArray(problems)) {
      return NextResponse.json({ success: false, error: 'Invalid data' }, { status: 400 })
    }

    const results = []

    for (const p of problems as GeneratedProblem[]) {
      // Transaction to create problem and test cases
      const problem = await prisma.$transaction(async (tx) => {
        // 1. Generate Problem Number
        // Find the latest problem number to increment
        const latestProblem = await tx.problem.findFirst({
          where: {
            problemNumber: {
              startsWith: 'P'
            }
          },
          orderBy: {
            problemNumber: 'desc'
          },
          select: {
            problemNumber: true
          }
        })
        
        let nextNumber = 1001 // Default start
        if (latestProblem?.problemNumber) {
          const match = latestProblem.problemNumber.match(/^P(\d+)$/)
          if (match) {
            nextNumber = parseInt(match[1], 10) + 1
          }
        }
        const finalProblemNumber = `P${nextNumber}`

        // 2. Map Difficulty
        // Default to '普及-' if mapping not found
        // Now AI returns exact difficulty string, so we use it directly, with fallback
        const systemDifficulty = p.difficulty || '普及-'

        // 3. Create Problem
        const newProblem = await tx.problem.create({
          data: {
            problemNumber: finalProblemNumber,
            title: p.title,
            description: p.description,
            input: p.input, // Direct mapping
            output: p.output, // Direct mapping
            samples: p.samples,
            hint: p.hint,
            difficulty: systemDifficulty,
            tags: p.tags,
            authorId: user.userId,
            isPublic: false, // Default to private until reviewed/published
            isAiGenerated: true,
            aiPrompt: logId ? `Generated from log ${logId}` : 'Manual AI generation',
            // Use AI recommended limits or defaults
            timeLimit: p.time_limit || 1000,
            memoryLimit: p.memory_limit || 128,
          }
        })

        // 4. Create Test Cases (Samples + Hidden)
        const allTestCases = []
        
        // Add Samples (isSample: true, score: 0)
        if (p.samples && p.samples.length > 0) {
            allTestCases.push(...p.samples.map((s, idx) => ({
                problemId: newProblem.id,
                input: s.input,
                output: s.output,
                isSample: true,
                score: 0,
                orderIndex: idx
            })))
        }

        // Add Hidden Test Cases (isSample: false, score: distributed)
        if (p.test_cases && p.test_cases.length > 0) {
            const sampleCount = allTestCases.length
            // 分数将在题目公开时自动均分，这里先设置临时分数
            allTestCases.push(...p.test_cases.map((tc, idx) => ({
                problemId: newProblem.id,
                input: tc.input,
                output: tc.output,
                isSample: false,
                score: 0, // 临时分数，公开时自动均分
                orderIndex: sampleCount + idx
            })))
        }

        if (allTestCases.length > 0) {
            await tx.testCase.createMany({
                data: allTestCases
            })
        }

        // 5. Create Solution (Optional)
        if (p.solution_cpp || p.solution_python) {
            await tx.solution.create({
                data: {
                    problemId: newProblem.id,
                    authorId: user.userId,
                    title: 'Reference Solution',
                    content: 'AI Generated Reference Solution',
                    code: p.solution_cpp || p.solution_python || '',
                    language: p.solution_cpp ? 'cpp' : 'python',
                    isOfficial: true
                }
            })
        }

        return newProblem
      })
      
      // 在事务外部分配分数
      const testCasesCount = await prisma.testCase.count({
        where: { problemId: problem.id }
      })
      if (testCasesCount > 0) {
        await redistributeTestScores(problem.id)
      }
      
      results.push(problem)
    }

    return NextResponse.json({ success: true, data: results })

  } catch (error) {
    console.error('AI Save Error:', error)
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 })
  }
}
