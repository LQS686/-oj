/**
 * /api/admin/testcases/upload - 上传测试点压缩包（管理员）
 */
import { withApi, ok, throw400, ApiError } from '@/lib/api/withApi'
import { parseTestCaseZip, TESTCASE_UPLOAD_CONFIG } from '@/lib/problem/testcase'
import { logger } from '@/lib/logger'

// A-P1-1 修复：上传大小限制（对齐 parseTestCaseZip 的 MAX_FILE_SIZE 上限）
const MAX_UPLOAD_BYTES = TESTCASE_UPLOAD_CONFIG.MAX_FILE_SIZE
// Content-Length 前置检查上限：50MB 压缩包 + multipart 表单开销余量
const MAX_CONTENT_LENGTH = 60 * 1024 * 1024

// 禁用 Next.js 默认的 body parser
export const dynamic = 'force-dynamic'
export const bodyParser = false

/**
 * POST /api/admin/testcases/upload - 上传测试点压缩包
 */
export const POST = withApi.admin(async (req, _ctx, { user: _user }) => {

  // A-P1-1 修复：读取 body 前先检查 Content-Length，超过上限直接拒绝，避免超大请求全量读入内存（OOM）
  const contentLength = Number(req.headers.get('content-length') || 0)
  if (contentLength > MAX_CONTENT_LENGTH) {
    throw new ApiError('PAYLOAD_TOO_LARGE', `上传文件过大（最大 ${MAX_UPLOAD_BYTES / 1024 / 1024}MB）`, 413)
  }

  logger.info('📥 收到测试点上传请求')

  // 获取上传的文件
  logger.info('📦 开始解析 FormData...')
  const formData = await req.formData()
  const file = formData.get('file') as File

  logger.info('📄 文件信息:', {
    name: file?.name,
    type: file?.type,
    size: file?.size,
  })

  if (!file) {
    logger.error('❌ 未选择文件')
    throw400('NO_FILE', '未选择文件')
  }

  // A-P1-1 修复：读取文件内容前按 file.size 校验（对齐 parseTestCaseZip 的 50MB 上限）
  if (file.size > MAX_UPLOAD_BYTES) {
    logger.error('❌ 文件大小超过限制:', file.size)
    throw400('FILE_TOO_LARGE', `压缩包大小超过限制（最大 ${MAX_UPLOAD_BYTES / 1024 / 1024}MB）`)
  }

  // 验证文件类型
  if (!file.type.includes('zip') && !file.name.endsWith('.zip')) {
    logger.error('❌ 文件类型错误:', file.type)
    throw400('INVALID_FILE_TYPE', '只支持 ZIP 格式压缩包')
  }

  // 读取文件内容
  logger.info('📖 开始读取文件内容...')
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  logger.info('✅ 文件读取完成，大小: ' + buffer.length + ' bytes')

  // 解析和验证测试点
  logger.info('🔍 开始解析测试点...')
  const result = await parseTestCaseZip(buffer)
  logger.info('📊 解析结果:', { success: result.success, count: result.testCases?.length })

  if (!result.success) {
    logger.error('❌ 测试点验证失败:', result.error)
    throw400('TEST_CASES_INVALID', result.error || '解析失败')
  }

  logger.info('✅ 测试点解析成功')
  // 返回完整测试点内容（管理端编辑需要全文；勿截断为 preview）
  return ok({
    testCases: result.testCases?.map((tc) => ({
      number: tc.number,
      inputFile: tc.inputFile,
      outputFile: tc.outputFile,
      inputSize: tc.inputSize,
      outputSize: tc.outputSize,
      input: tc.inputContent,
      output: tc.outputContent,
    })),
    totalSize: result.totalSize,
    count: result.testCases?.length || 0,
    message: `成功解析 ${result.testCases?.length} 个测试点`,
  })
})
