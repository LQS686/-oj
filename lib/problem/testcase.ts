/**
 * lib/problem/testcase.ts
 * 题目测试用例相关操作统一入口（仅服务端）
 * ⚠️ 包含 prisma + fs + AdmZip 依赖，不能在客户端组件中 import
 * 客户端需要的纯函数（分数计算）请从 `@/lib/problem/testcase-scoring` 导入
 */
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import AdmZip from 'adm-zip'
import path from 'path'
import fs from 'fs'

// 重新导出纯函数以兼容服务端 import（不会把 fs 传到客户端因为这些函数本身无副作用）
export {
  TOTAL_SCORE,
  distributeTestCaseScores,
  assertTotalScoreIs100,
  normalizeTestCaseScores,
  ensureTotalScoreIs100,
} from './testcase-scoring'

export interface TestcaseData {
  input: string
  output: string
  score?: number
}

/* ============================================================================
 * 测试用例 CRUD
 * ========================================================================== */

/**
 * 批量保存测试用例并计算分数
 */
export async function saveTestcases(problemId: string, testcases: TestcaseData[]) {
  await prisma.testCase.deleteMany({ where: { problemId } })
  if (!testcases.length) return { count: 0 }
  const equalScore = Math.floor(100 / testcases.length)
  const data = testcases.map((tc, idx) => ({
    problemId,
    input: tc.input,
    output: tc.output,
    score: tc.score ?? (idx === testcases.length - 1 ? 100 - equalScore * (testcases.length - 1) : equalScore),
    orderIndex: idx,
  }))
  await prisma.testCase.createMany({ data })
  return { count: data.length }
}

/**
 * 获取题目的所有测试用例
 */
export async function listTestcases(problemId: string) {
  return prisma.testCase.findMany({
    where: { problemId },
    orderBy: { orderIndex: 'asc' },
  })
}

/**
 * 上传测试用例文件（base64）
 */
export async function uploadTestcaseFile(problemId: string, _fileName: string, content: string) {
  return prisma.testCase.create({
    data: {
      problemId,
      input: content,
      output: '',
      orderIndex: 0,
    },
  })
}

/**
 * 计算测试用例分数总和
 */
export async function calculateScore(problemId: string, submissionOutputs: string[]): Promise<number> {
  const testcases = await listTestcases(problemId)
  if (!testcases.length) return 0
  let total = 0
  testcases.forEach((tc: any, idx: any) => {
    if (submissionOutputs[idx]?.trim() === tc.output.trim()) {
      total += tc.score ?? 0
    }
  })
  return total
}

/**
 * 重新分配单题测试用例分数（DB 写操作）
 */
export async function redistributeTestScores(problemId: string): Promise<void> {
  try {
    const testCases = await prisma.testCase.findMany({
      where: { problemId },
      orderBy: { orderIndex: 'asc' },
    })
    if (!testCases.length) return

    const totalScore = 100
    const baseScore = Math.floor(totalScore / testCases.length)
    const remainder = totalScore % testCases.length
    const updates = testCases.map((tc: any, index: any) =>
      prisma.testCase.update({
        where: { id: tc.id },
        data: { score: baseScore + (index < remainder ? 1 : 0) },
      })
    )
    await Promise.all(updates)
    logger.info(`题目 ${problemId} 测试用例分数已重新分配，共 ${testCases.length} 个用例`)
  } catch (error) {
    logger.error(`重新分配测试用例分数失败: ${problemId}`, error)
    throw error
  }
}

/**
 * 重新分配所有题目测试用例分数
 */
export async function redistributeAllProblemScores(): Promise<void> {
  try {
    const problems = await prisma.problem.findMany({ select: { id: true } })
    for (const p of problems) await redistributeTestScores(p.id)
    logger.info(`已重新分配 ${problems.length} 个题目的测试用例分数`)
  } catch (error) {
    logger.error('重新分配所有题目分数失败', error)
    throw error
  }
}

/* ============================================================================
 * 测试点压缩包解析
 * ========================================================================== */

export const TESTCASE_UPLOAD_CONFIG = {
  MAX_FILE_SIZE: 50 * 1024 * 1024,
  MAX_UNZIP_SIZE: 100 * 1024 * 1024,
  MAX_TESTCASES: 50,
  MAX_TIME_LIMIT: 10000,
  MAX_MEMORY_LIMIT: 512,
  ALLOWED_EXTENSIONS: ['.in', '.out'],
  ALLOWED_MIME_TYPES: ['application/zip', 'application/x-zip-compressed'],
}

export interface TestCaseFile {
  number: number
  inputFile: string
  outputFile: string
  inputContent: string
  outputContent: string
  inputSize: number
  outputSize: number
}

export interface ValidationResult {
  success: boolean
  error?: string
  testCases?: TestCaseFile[]
  totalSize?: number
}

export function validateFileName(fileName: string): { valid: boolean; number?: number; type?: 'in' | 'out' } {
  const ext = path.extname(fileName).toLowerCase()
  if (ext !== '.in' && ext !== '.out') return { valid: false }
  const nameWithoutExt = path.basename(fileName, ext)
  const numberMatch = nameWithoutExt.match(/(\d+)/)
  if (!numberMatch) return { valid: false }
  return { valid: true, number: parseInt(numberMatch[1], 10), type: ext === '.in' ? 'in' : 'out' }
}

export function validateLineEndings(content: string): boolean {
  return !content.includes('\r')
}

export async function parseTestCaseZip(zipBuffer: Buffer): Promise<ValidationResult> {
  try {
    if (zipBuffer.length > TESTCASE_UPLOAD_CONFIG.MAX_FILE_SIZE) {
      return { success: false, error: `压缩包大小超过限制（最大${TESTCASE_UPLOAD_CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB）` }
    }

    const zip = new AdmZip(zipBuffer)
    const zipEntries = zip.getEntries()
    const hasFolder = zipEntries.some((e) => e.isDirectory)
    if (hasFolder) return { success: false, error: '压缩包内不得包含文件夹' }

    const testCaseMap = new Map<number, { in?: Buffer; out?: Buffer; inName?: string; outName?: string }>()
    let totalUnzipSize = 0

    for (const entry of zipEntries) {
      if (entry.isDirectory) continue
      const fileName = entry.entryName
      const fileSize = entry.header.size
      totalUnzipSize += fileSize
      const validation = validateFileName(fileName)
      if (!validation.valid) {
        return { success: false, error: `文件名不符合规范: ${fileName}` }
      }
      const { number, type } = validation
      if (!testCaseMap.has(number!)) testCaseMap.set(number!, {})
      const tc = testCaseMap.get(number!)!
      const fileContent = entry.getData()
      if (type === 'in') {
        if (tc.in) return { success: false, error: `测试点 ${number} 的输入文件重复` }
        tc.in = fileContent
        tc.inName = fileName
      } else {
        if (tc.out) return { success: false, error: `测试点 ${number} 的输出文件重复` }
        tc.out = fileContent
        tc.outName = fileName
      }
    }

    if (totalUnzipSize > TESTCASE_UPLOAD_CONFIG.MAX_UNZIP_SIZE) {
      return { success: false, error: `解压后文件总大小超过限制` }
    }

    const testCases: TestCaseFile[] = []
    for (const [number, files] of testCaseMap.entries()) {
      if (!files.in || !files.out) {
        return { success: false, error: `测试点 ${number} 缺少${!files.in ? '输入' : '输出'}文件` }
      }
      const inputContent = files.in.toString('utf-8')
      const outputContent = files.out.toString('utf-8')
      if (!validateLineEndings(inputContent)) {
        return { success: false, error: `测试点 ${number} 的输入文件包含 Windows 换行符` }
      }
      if (!validateLineEndings(outputContent)) {
        return { success: false, error: `测试点 ${number} 的输出文件包含 Windows 换行符` }
      }
      testCases.push({
        number,
        inputFile: files.inName!,
        outputFile: files.outName!,
        inputContent,
        outputContent,
        inputSize: files.in.length,
        outputSize: files.out.length,
      })
    }

    if (testCases.length === 0) return { success: false, error: '压缩包中没有有效的测试点文件' }
    if (testCases.length > TESTCASE_UPLOAD_CONFIG.MAX_TESTCASES) {
      return { success: false, error: `测试点数量超过限制（最多${TESTCASE_UPLOAD_CONFIG.MAX_TESTCASES}对）` }
    }
    testCases.sort((a, b) => a.number - b.number)
    return { success: true, testCases, totalSize: totalUnzipSize }
  } catch (error) {
    logger.error('解析测试点压缩包失败', error)
    return { success: false, error: error instanceof Error ? error.message : '解析压缩包失败' }
  }
}

export async function saveTestCaseFiles(
  problemId: string,
  testCases: TestCaseFile[],
  baseDir: string = './data/testcases'
): Promise<{ success: boolean; error?: string; paths?: string[] }> {
  try {
    const problemDir = path.join(baseDir, problemId)
    if (!fs.existsSync(problemDir)) fs.mkdirSync(problemDir, { recursive: true })
    const savedPaths: string[] = []
    for (const tc of testCases) {
      const inPath = path.join(problemDir, `${tc.number}.in`)
      const outPath = path.join(problemDir, `${tc.number}.out`)
      fs.writeFileSync(inPath, tc.inputContent, 'utf-8')
      fs.writeFileSync(outPath, tc.outputContent, 'utf-8')
      savedPaths.push(inPath, outPath)
    }
    return { success: true, paths: savedPaths }
  } catch (error) {
    logger.error('保存测试点文件失败', error)
    return { success: false, error: error instanceof Error ? error.message : '保存文件失败' }
  }
}

export async function deleteTestCaseFiles(
  problemId: string,
  baseDir: string = './data/testcases'
): Promise<void> {
  try {
    const problemDir = path.join(baseDir, problemId)
    if (fs.existsSync(problemDir)) fs.rmSync(problemDir, { recursive: true, force: true })
  } catch (error) {
    logger.error('删除测试点文件失败', error)
  }
}
