/**
 * /api/admin/submissions - 提交记录列表（管理员）
 */
import { withApi, ok, throw403, readQuery } from '@/lib/api/withApi'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/admin/submissions - 获取所有提交记录（管理员）
 */
export const GET = withApi.auth(async (req, _ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }

  // 获取查询参数
  const query = readQuery<{ page?: string; pageSize?: string; status?: string }>(req)
  const page = parseInt(query.page || '1')
  const pageSize = parseInt(query.pageSize || '50')
  const status = query.status

  // 构建查询条件
  const where: any = {}
  if (status && status !== 'all') {
    where.status = status
  }

  // 获取提交记录总数
  const total = await prisma.submission.count({ where })

  // 获取分页的提交记录（不使用 include，手动查询关联数据）
  const submissionsRaw = await prisma.submission.findMany({
    where,
    skip: (page - 1) * pageSize,
    take: pageSize,
    orderBy: { submittedAt: 'desc' },
    select: {
      id: true,
      userId: true,
      problemId: true,
      language: true,
      code: true,
      status: true,
      score: true,
      time: true,
      memory: true,
      passedTests: true,
      totalTests: true,
      message: true,
      submittedAt: true,
    },
  })

  // ✅ 手动查询用户和题目信息，优雅处理已删除的数据
  const submissions = await Promise.all(
    submissionsRaw.map(async (sub) => {
      const [user, problem] = await Promise.all([
        prisma.user.findUnique({
          where: { id: sub.userId },
          select: {
            id: true,
            username: true,
            nickname: true,
          },
        }),
        prisma.problem.findUnique({
          where: { id: sub.problemId },
          select: {
            id: true,
            problemNumber: true,
            title: true,
          },
        }),
      ])

      return {
        ...sub,
        user: user || {
          id: sub.userId,
          username: '未知用户',
          nickname: '未知用户',
        },
        problem: problem || {
          id: sub.problemId,
          problemNumber: '',
          title: '题目已删除',
        },
      }
    }),
  )

  return ok({
    data: {
      submissions,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  })
})
