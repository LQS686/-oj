import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { parseTestCaseZip } from '@/lib/testcase-upload'

// 禁用 Next.js 默认的 body parser
export const dynamic = 'force-dynamic'
export const bodyParser = false

/**
 * POST /api/admin/testcases/upload - 上传测试点压缩包
 */
export async function POST(request: NextRequest) {
  try {
    console.log('📥 收到测试点上传请求')

    // 验证管理员权限
    const auth = await requireAdmin(request)
    console.log('🔐 权限验证结果:', { isAdmin: auth.isAdmin, user: auth.user })
    
    if (!auth.isAdmin) {
      console.error('❌ 权限验证失败:', auth.error)
      return NextResponse.json(
        { success: false, error: auth.error || '需要管理员权限' },
        { status: 403 }
      )
    }

    // 获取上传的文件
    console.log('📦 开始解析 FormData...')
    const formData = await request.formData()
    const file = formData.get('file') as File
    
    console.log('📄 文件信息:', {
      name: file?.name,
      type: file?.type,
      size: file?.size
    })
    
    if (!file) {
      console.error('❌ 未选择文件')
      return NextResponse.json(
        { success: false, error: '未选择文件' },
        { status: 400 }
      )
    }

    // 验证文件类型
    if (!file.type.includes('zip') && !file.name.endsWith('.zip')) {
      console.error('❌ 文件类型错误:', file.type)
      return NextResponse.json(
        { success: false, error: '只支持 ZIP 格式压缩包' },
        { status: 400 }
      )
    }

    // 读取文件内容
    console.log('📖 开始读取文件内容...')
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    console.log('✅ 文件读取完成，大小:', buffer.length, 'bytes')

    // 解析和验证测试点
    console.log('🔍 开始解析测试点...')
    const result = await parseTestCaseZip(buffer)
    console.log('📊 解析结果:', { success: result.success, count: result.testCases?.length })

    if (!result.success) {
      console.error('❌ 测试点验证失败:', result.error)
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      )
    }

    console.log('✅ 测试点解析成功')
    // 返回解析结果
    return NextResponse.json({
      success: true,
      data: {
        testCases: result.testCases?.map(tc => ({
          number: tc.number,
          inputFile: tc.inputFile,
          outputFile: tc.outputFile,
          inputSize: tc.inputSize,
          outputSize: tc.outputSize,
          inputPreview: tc.inputContent.substring(0, 200),
          outputPreview: tc.outputContent.substring(0, 200)
        })),
        totalSize: result.totalSize,
        count: result.testCases?.length || 0
      },
      message: `成功解析 ${result.testCases?.length} 个测试点`
    })
  } catch (error) {
    console.error('💥 上传测试点失败 - 捕获异常:', error)
    console.error('💥 错误堆栈:', error instanceof Error ? error.stack : 'N/A')
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '服务器错误' },
      { status: 500 }
    )
  }
}
