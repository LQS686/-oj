import AdmZip from 'adm-zip'
import path from 'path'
import fs from 'fs'

// 测试点上传配置
export const TESTCASE_UPLOAD_CONFIG = {
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
  MAX_UNZIP_SIZE: 100 * 1024 * 1024, // 100MB
  MAX_TESTCASES: 50, // 最多50对测试点
  MAX_TIME_LIMIT: 10000, // 最大10秒
  MAX_MEMORY_LIMIT: 512, // 最大512MB
  ALLOWED_EXTENSIONS: ['.in', '.out'],
  ALLOWED_MIME_TYPES: ['application/zip', 'application/x-zip-compressed']
}

// 测试点文件接口
export interface TestCaseFile {
  number: number
  inputFile: string
  outputFile: string
  inputContent: string
  outputContent: string
  inputSize: number
  outputSize: number
}

// 验证结果接口
export interface ValidationResult {
  success: boolean
  error?: string
  testCases?: TestCaseFile[]
  totalSize?: number
}

/**
 * 验证文件名是否符合规范
 * 必须包含连续数字作为测试点编号
 */
export function validateFileName(fileName: string): { valid: boolean; number?: number; type?: 'in' | 'out' } {
  const ext = path.extname(fileName).toLowerCase()
  
  if (ext !== '.in' && ext !== '.out') {
    return { valid: false }
  }

  const nameWithoutExt = path.basename(fileName, ext)
  
  // 提取文件名中的连续数字
  const numberMatch = nameWithoutExt.match(/(\d+)/)
  
  if (!numberMatch) {
    return { valid: false }
  }

  const number = parseInt(numberMatch[1], 10)
  
  return {
    valid: true,
    number,
    type: ext === '.in' ? 'in' : 'out'
  }
}

/**
 * 验证文本文件换行符
 * 必须使用 LF (\n)，不能使用 CR+LF (\r\n)
 */
export function validateLineEndings(content: string): boolean {
  // 检查是否包含 \r
  return !content.includes('\r')
}

/**
 * 解析并验证测试点压缩包
 */
export async function parseTestCaseZip(zipBuffer: Buffer): Promise<ValidationResult> {
  try {
    // 验证文件大小
    if (zipBuffer.length > TESTCASE_UPLOAD_CONFIG.MAX_FILE_SIZE) {
      return {
        success: false,
        error: `压缩包大小超过限制（最大${TESTCASE_UPLOAD_CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB）`
      }
    }

    // 解压文件
    const zip = new AdmZip(zipBuffer)
    const zipEntries = zip.getEntries()

    // 验证压缩包结构
    const hasFolder = zipEntries.some(entry => entry.isDirectory)
    if (hasFolder) {
      return {
        success: false,
        error: '压缩包内不得包含文件夹，所有测试点文件必须在根目录'
      }
    }

    // 解析测试点文件
    const testCaseMap = new Map<number, { in?: Buffer; out?: Buffer; inName?: string; outName?: string }>()
    let totalUnzipSize = 0

    for (const entry of zipEntries) {
      if (entry.isDirectory) continue

      const fileName = entry.entryName
      const fileSize = entry.header.size

      // 累计解压大小
      totalUnzipSize += fileSize

      // 验证文件名
      const validation = validateFileName(fileName)
      if (!validation.valid) {
        return {
          success: false,
          error: `文件名不符合规范: ${fileName}（必须包含连续数字编号，扩展名为 .in 或 .out）`
        }
      }

      const { number, type } = validation

      // 获取或创建测试点条目
      if (!testCaseMap.has(number!)) {
        testCaseMap.set(number!, {})
      }

      const testCase = testCaseMap.get(number!)!
      const fileContent = entry.getData()

      if (type === 'in') {
        if (testCase.in) {
          return {
            success: false,
            error: `测试点 ${number} 的输入文件重复`
          }
        }
        testCase.in = fileContent
        testCase.inName = fileName
      } else {
        if (testCase.out) {
          return {
            success: false,
            error: `测试点 ${number} 的输出文件重复`
          }
        }
        testCase.out = fileContent
        testCase.outName = fileName
      }
    }

    // 验证解压后总大小
    if (totalUnzipSize > TESTCASE_UPLOAD_CONFIG.MAX_UNZIP_SIZE) {
      return {
        success: false,
        error: `解压后文件总大小超过限制（最大${TESTCASE_UPLOAD_CONFIG.MAX_UNZIP_SIZE / 1024 / 1024}MB）`
      }
    }

    // 验证测试点完整性
    const testCases: TestCaseFile[] = []

    for (const [number, files] of testCaseMap.entries()) {
      if (!files.in || !files.out) {
        return {
          success: false,
          error: `测试点 ${number} 缺少${!files.in ? '输入' : '输出'}文件`
        }
      }

      const inputContent = files.in.toString('utf-8')
      const outputContent = files.out.toString('utf-8')

      // 验证换行符
      if (!validateLineEndings(inputContent)) {
        return {
          success: false,
          error: `测试点 ${number} 的输入文件包含 Windows 换行符（CR+LF），必须使用 Linux 换行符（LF）`
        }
      }

      if (!validateLineEndings(outputContent)) {
        return {
          success: false,
          error: `测试点 ${number} 的输出文件包含 Windows 换行符（CR+LF），必须使用 Linux 换行符（LF）`
        }
      }

      testCases.push({
        number,
        inputFile: files.inName!,
        outputFile: files.outName!,
        inputContent,
        outputContent,
        inputSize: files.in.length,
        outputSize: files.out.length
      })
    }

    // 验证测试点数量
    if (testCases.length === 0) {
      return {
        success: false,
        error: '压缩包中没有有效的测试点文件'
      }
    }

    if (testCases.length > TESTCASE_UPLOAD_CONFIG.MAX_TESTCASES) {
      return {
        success: false,
        error: `测试点数量超过限制（最多${TESTCASE_UPLOAD_CONFIG.MAX_TESTCASES}对）`
      }
    }

    // 按编号排序
    testCases.sort((a, b) => a.number - b.number)

    return {
      success: true,
      testCases,
      totalSize: totalUnzipSize
    }
  } catch (error) {
    console.error('解析测试点压缩包失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '解析压缩包失败'
    }
  }
}

/**
 * 保存测试点文件到磁盘（可选，用于持久化存储）
 */
export async function saveTestCaseFiles(
  problemId: string,
  testCases: TestCaseFile[],
  baseDir: string = './data/testcases'
): Promise<{ success: boolean; error?: string; paths?: string[] }> {
  try {
    const problemDir = path.join(baseDir, problemId)

    // 创建目录
    if (!fs.existsSync(problemDir)) {
      fs.mkdirSync(problemDir, { recursive: true })
    }

    const savedPaths: string[] = []

    for (const testCase of testCases) {
      const inPath = path.join(problemDir, `${testCase.number}.in`)
      const outPath = path.join(problemDir, `${testCase.number}.out`)

      // 保存文件
      fs.writeFileSync(inPath, testCase.inputContent, 'utf-8')
      fs.writeFileSync(outPath, testCase.outputContent, 'utf-8')

      savedPaths.push(inPath, outPath)
    }

    return {
      success: true,
      paths: savedPaths
    }
  } catch (error) {
    console.error('保存测试点文件失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '保存文件失败'
    }
  }
}

/**
 * 删除题目的测试点文件
 */
export async function deleteTestCaseFiles(
  problemId: string,
  baseDir: string = './data/testcases'
): Promise<void> {
  try {
    const problemDir = path.join(baseDir, problemId)
    
    if (fs.existsSync(problemDir)) {
      fs.rmSync(problemDir, { recursive: true, force: true })
    }
  } catch (error) {
    console.error('删除测试点文件失败:', error)
  }
}
