/**
 * @deprecated use POST /api/admin/ai/solution/regenerate instead
 *
 * 旧路径兼容：返回 308 永久重定向到新路径 /api/admin/ai/solution/regenerate
 * 前端应迁移至新路径，body: { problemId }
 */

export const POST = async () => {
  return Response.json(
    {},
    {
      status: 308,
      headers: { Location: '/api/admin/ai/solution/regenerate' },
    }
  )
}
