/**
 * 测点 I/O 懒加载：评测任务只携带测点元数据；运行时把单个测点落盘，
 * 避免在 V8 堆中长期持有百万行 input/output 字符串。
 *
 * 磁盘缓存（洛谷式）：data/testdata/<testCaseId>/{input.txt,output.txt}
 * 命中后直接只读复用，不再经 Prisma → V8 大字符串。
 */
import { writeFile, unlink, mkdir, rm, copyFile } from 'fs/promises'
import { existsSync, mkdirSync, statSync } from 'fs'
import { join } from 'path'
import * as crypto from 'crypto'
import { prisma } from '@/lib/prisma'

export interface JudgeTestCaseMeta {
  id: string
  /** 兼容字段；正式评测走落盘路径，不再填正文 */
  input: string
  output: string
  score: number
  timeLimit?: number
  memoryLimit?: number
}

export interface MaterializedTestCase {
  inputPath: string
  expectedPath: string
  expectedBytes: number
  inputBytes?: number
  /** true = 路径指向 data/testdata 缓存，cleanup 时勿删 */
  fromCache?: boolean
}

/** 测点磁盘体积（用于自适应并发；未缓存时返回 0） */
export function peekTestCaseDiskBytes(id: string): { inputBytes: number; outputBytes: number; cached: boolean } {
  try {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      return { inputBytes: 0, outputBytes: 0, cached: false }
    }
    const { inputPath, outputPath } = cachePaths(id)
    if (!existsSync(inputPath) || !existsSync(outputPath)) {
      return { inputBytes: 0, outputBytes: 0, cached: false }
    }
    return {
      inputBytes: statSync(inputPath).size,
      outputBytes: statSync(outputPath).size,
      cached: true,
    }
  } catch {
    return { inputBytes: 0, outputBytes: 0, cached: false }
  }
}

const TESTDATA_ROOT = join(process.cwd(), 'data', 'testdata')

function cacheDirFor(id: string): string {
  // 防止路径穿越：只允许 ObjectId/cuid 风格字符
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error(`非法测点 id: ${id}`)
  }
  return join(TESTDATA_ROOT, id)
}

function cachePaths(id: string): { dir: string; inputPath: string; outputPath: string } {
  const dir = cacheDirFor(id)
  return {
    dir,
    inputPath: join(dir, 'input.txt'),
    outputPath: join(dir, 'output.txt'),
  }
}

/** 仅映射元数据，不拷贝 input/output 正文 */
export function mapTestCasesMeta(
  testCases: Array<{
    id: string
    score: number
    timeLimit?: number | null
    memoryLimit?: number | null
  }>
): JudgeTestCaseMeta[] {
  return testCases.map((tc) => ({
    id: tc.id,
    input: '',
    output: '',
    score: tc.score,
    timeLimit: tc.timeLimit ?? undefined,
    memoryLimit: tc.memoryLimit ?? undefined,
  }))
}

/** 评测入队时查询测点用的 select（不含大字段） */
export const TESTCASE_META_SELECT = {
  id: true,
  score: true,
  timeLimit: true,
  memoryLimit: true,
} as const

/** 删除单个测点磁盘缓存（测点内容变更 / 删除时调用） */
export async function invalidateTestCaseCache(id: string): Promise<void> {
  try {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) return
    const dir = cacheDirFor(id)
    if (existsSync(dir)) {
      await rm(dir, { recursive: true, force: true })
    }
  } catch {
    // ignore
  }
}

/** 题目测点整体替换前：按 problemId 查出旧 id 并清缓存 */
export async function invalidateProblemTestCaseCache(problemId: string): Promise<void> {
  try {
    const rows = await prisma.testCase.findMany({
      where: { problemId },
      select: { id: true },
    })
    await Promise.all(rows.map((r) => invalidateTestCaseCache(r.id)))
  } catch {
    // ignore
  }
}

function tryReadCache(id: string): MaterializedTestCase | null {
  const { inputPath, outputPath } = cachePaths(id)
  if (!existsSync(inputPath) || !existsSync(outputPath)) return null
  try {
    const expectedBytes = statSync(outputPath).size
    const inputBytes = existsSync(inputPath) ? statSync(inputPath).size : 0
    return {
      inputPath,
      expectedPath: outputPath,
      expectedBytes,
      inputBytes,
      fromCache: true,
    }
  } catch {
    return null
  }
}

async function writeCacheFromStrings(
  id: string,
  inputStr: string,
  outputStr: string
): Promise<MaterializedTestCase> {
  const { dir, inputPath, outputPath } = cachePaths(id)
  await mkdir(dir, { recursive: true })
  // 先写临时再 rename，避免半写入脏缓存（跨盘时 fallback 直接写）
  const tag = crypto.randomBytes(4).toString('hex')
  const tmpIn = join(dir, `.in.${tag}.tmp`)
  const tmpOut = join(dir, `.out.${tag}.tmp`)
  await writeFile(tmpIn, inputStr, 'utf-8')
  await writeFile(tmpOut, outputStr, 'utf-8')
  try {
    const { rename } = await import('fs/promises')
    await rename(tmpIn, inputPath)
    await rename(tmpOut, outputPath)
  } catch {
    await copyFile(tmpIn, inputPath)
    await copyFile(tmpOut, outputPath)
    await unlink(tmpIn).catch(() => {})
    await unlink(tmpOut).catch(() => {})
  }
  const expectedBytes = existsSync(outputPath) ? statSync(outputPath).size : 0
  return {
    inputPath,
    expectedPath: outputPath,
    expectedBytes,
    fromCache: true,
  }
}

/**
 * 将单个测点 I/O 落到可评测路径并返回。
 * 优先磁盘缓存；未命中则 Prisma 读出后写入缓存。
 * 缓存路径只读复用，cleanupMaterializedTestCase 不会删除。
 */
export async function materializeTestCaseToDisk(id: string): Promise<MaterializedTestCase | null> {
  const cached = tryReadCache(id)
  if (cached) return cached

  const tc = await prisma.testCase.findUnique({
    where: { id },
    select: { input: true, output: true },
  })
  if (!tc) return null

  let inputStr: string | null = tc.input ?? ''
  let outputStr: string | null = tc.output ?? ''
  ;(tc as { input?: string | null }).input = null
  ;(tc as { output?: string | null }).output = null

  try {
    const result = await writeCacheFromStrings(id, inputStr, outputStr!)
    inputStr = null
    outputStr = null
    return result
  } catch {
    // 缓存写失败时退回 temp（仍须释放字符串）
    const tempDir = join(process.cwd(), 'temp', 'judge')
    if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true })
    const tag = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}`
    const inputPath = join(tempDir, `tc_in_${tag}.txt`)
    const expectedPath = join(tempDir, `tc_ans_${tag}.txt`)
    await writeFile(inputPath, inputStr ?? '', 'utf-8')
    inputStr = null
    await writeFile(expectedPath, outputStr ?? '', 'utf-8')
    outputStr = null
    const expectedBytes = existsSync(expectedPath) ? statSync(expectedPath).size : 0
    return { inputPath, expectedPath, expectedBytes, fromCache: false }
  }
}

export async function cleanupMaterializedTestCase(files: MaterializedTestCase | null | undefined): Promise<void> {
  if (!files) return
  // 磁盘缓存只读复用，勿删
  if (files.fromCache) return
  for (const p of [files.inputPath, files.expectedPath]) {
    try {
      if (p && existsSync(p)) await unlink(p)
    } catch {
      // ignore
    }
  }
}

/** @deprecated 仅 pretest/兼容；正式评测请用 materializeTestCaseToDisk */
export async function loadTestCaseForJudge(id: string): Promise<{ input: string; output: string } | null> {
  const tc = await prisma.testCase.findUnique({
    where: { id },
    select: { input: true, output: true },
  })
  if (!tc) return null
  return { input: tc.input ?? '', output: tc.output ?? '' }
}
