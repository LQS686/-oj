/**
 * /api/admin/users/batch-register - 批量注册用户（管理员）
 *
 * 支持两种 Content-Type：
 *  - multipart/form-data + CSV 文件
 *  - application/json + users 数组（最多 100 个）
 *
 * 每行返回 { total, succeeded, failed, errors: [{ row, username, email, error }] }
 */
import { withApi, ok, readJson, throw400, throw403 } from '@/lib/api/withApi'
import { withPermission } from '@/lib/api/withPermission'
import { isSystemAdmin } from '@/lib/permissions'
import {
  batchRegisterUsers,
  parseBatchRegisterCSV,
  type BatchUserInput,
} from '@/lib/user/service'

const MAX_JSON_USERS = 100

/**
 * POST /api/admin/users/batch-register
 * - 管理员批量注册用户
 * - 支持 JSON body 或 multipart/form-data 上传 CSV
 */
export const POST = withApi.auth(withPermission('admin.access')(async (req, _ctx, { user }) => {
  if (!isSystemAdmin(user)) {
    throw403('需要系统管理员权限')
  }

  const contentType = req.headers.get('content-type') || ''
  let users: BatchUserInput[] = []
  let startRow = 1

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData()
    const file = formData.get('file')
    if (!file || !(file instanceof File)) {
      throw400('NO_FILE', '请上传CSV文件')
    }
    const f = file as File
    if (!f.name.endsWith('.csv') && !f.name.endsWith('.txt')) {
      throw400('BAD_FILE_TYPE', '只支持CSV或TXT格式文件')
    }
    const csvText = await f.text()
    try {
      users = parseBatchRegisterCSV(csvText)
    } catch (parseError) {
      throw400('CSV_PARSE_ERROR', parseError instanceof Error ? parseError.message : 'CSV解析失败')
    }
    if (users.length === 0) {
      throw400('EMPTY_CSV', 'CSV文件中没有有效的用户数据')
    }
    // CSV 跳过表头，行号从 2 开始
    startRow = 2
  } else {
    const body = await readJson<{ users?: BatchUserInput[] }>(req)
    users = body.users || []
    if (users.length === 0) {
      throw400('EMPTY_USERS', '用户数组不能为空')
    }
    if (users.length > MAX_JSON_USERS) {
      throw400('TOO_MANY', '单次最多批量注册100个用户')
    }
    // JSON 不含表头，行号从 1 开始
    startRow = 1
  }

  const result = await batchRegisterUsers(users, startRow)
  return ok(result)
}))
