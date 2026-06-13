/**
 * /api/admin/testcases/upload - 上传测试点压缩包（管理员）
 */
import { withApi, ok, throw400 } from '@/lib/api/withApi'
import { parseTestCaseZip } from '@/lib/problem/testcase'
import { logger } from '@/lib/logger'

// 禁用 Next.js 默认的 body parser
export const dynamic = 'force-dynamic'
export const bodyParser = false

/**
 * POST /api/admin/testcases/upload - 上传测试点压缩包
 */
export const POST = withApi.admin(async (req, _ctx, { user }) => {

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
  // 返回解析结果
  return ok({
    testCases: result.testCases?.map((tc) => ({
      number: tc.number,
      inputFile: tc.inputFile,
      outputFile: tc.outputFile,
      inputSize: tc.inputSize,
      outputSize: tc.outputSize,
      inputPreview: tc.inputContent.substring(0, 200),
      outputPreview: tc.outputContent.substring(0, 200),
    })),
    totalSize: result.totalSize,
    count: result.testCases?.length || 0,
    message: `成功解析 ${result.testCases?.length} 个测试点`,
  })
})
