/**
 * prisma/seed-permissions.ts
 * 权限点 seed 脚本（与 prisma/seed.ts 解耦，可独立运行）
 *
 * 职责：
 *   1) upsert 全部 Permission（按 code 唯一键）
 *   2) 清空 RolePermission 后批量插入 3 个系统角色的默认权限集
 *      - SYSTEM_ADMIN：全部权限点
 *      - TEACHER：业务管理类（class.* / problem.* / contest.* / training.* / post.* / user.view|edit）
 *      - STUDENT：仅普通用户类（post.create|edit / contest.participate.manage）
 *   3) 打印 "Seed 完成：N 个权限点，M 个角色权限映射"
 *
 * 运行：npx tsx prisma/seed-permissions.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/* ============================================================================
 * 1) 全部权限点定义（≥ 30 个）
 * ========================================================================== */

interface PermissionDef {
  code: string
  module: string
  name: string
  description?: string
}

const PERMISSIONS: PermissionDef[] = [
  // user
  { code: 'user.view',            module: 'user',     name: '查看用户',   description: '查看用户资料与列表' },
  { code: 'user.edit',            module: 'user',     name: '编辑用户',   description: '修改用户基本信息' },
  { code: 'user.ban',             module: 'user',     name: '封禁用户',   description: '封禁/解封用户' },
  { code: 'user.delete',          module: 'user',     name: '删除用户',   description: '删除用户账号' },
  { code: 'user.role.assign',     module: 'user',     name: '分配用户角色', description: '修改用户的系统级角色' },

  // class
  { code: 'class.create',         module: 'class',    name: '创建班级',   description: '创建新的班级' },
  { code: 'class.edit',           module: 'class',    name: '编辑班级',   description: '编辑班级信息' },
  { code: 'class.delete',         module: 'class',    name: '删除班级',   description: '删除班级' },
  { code: 'class.member.manage',  module: 'class',    name: '管理班级成员', description: '增减/移除班级成员' },
  { code: 'class.invite.manage',  module: 'class',    name: '管理班级邀请', description: '生成/撤销班级邀请码' },
  { code: 'class.assignment.manage', module: 'class', name: '管理班级作业', description: '创建/编辑/删除班级作业' },

  // problem
  { code: 'problem.create',       module: 'problem',  name: '创建题目',   description: '创建新题目' },
  { code: 'problem.edit',         module: 'problem',  name: '编辑题目',   description: '编辑题目内容' },
  { code: 'problem.delete',       module: 'problem',  name: '删除题目',   description: '删除题目' },
  { code: 'problem.review',       module: 'problem',  name: '审核题目',   description: '审核/发布题目' },
  { code: 'problem.testcase.manage', module: 'problem', name: '管理测试用例', description: '管理题目测试用例' },

  // contest
  { code: 'contest.create',       module: 'contest',  name: '创建竞赛',   description: '创建新竞赛' },
  { code: 'contest.edit',         module: 'contest',  name: '编辑竞赛',   description: '编辑竞赛信息' },
  { code: 'contest.delete',       module: 'contest',  name: '删除竞赛',   description: '删除竞赛' },
  { code: 'contest.participate.manage', module: 'contest', name: '管理竞赛参与', description: '踢人/封号等竞赛管理' },
  { code: 'contest.scoreboard.view', module: 'contest', name: '查看竞赛排行榜', description: '查看竞赛排行榜（非公开场景）' },

  // training
  { code: 'training.create',      module: 'training', name: '创建题单',   description: '创建训练题单' },
  { code: 'training.edit',        module: 'training', name: '编辑题单',   description: '编辑训练题单' },
  { code: 'training.delete',      module: 'training', name: '删除题单',   description: '删除训练题单' },
  { code: 'training.publish',     module: 'training', name: '发布题单',   description: '发布/下架题单' },
  { code: 'training.category.manage', module: 'training', name: '管理题单分类', description: '管理题单分类' },

  // post
  { code: 'post.create',          module: 'post',     name: '发布帖子',   description: '发布讨论帖子' },
  { code: 'post.edit',            module: 'post',     name: '编辑帖子',   description: '编辑帖子内容' },
  { code: 'post.delete',          module: 'post',     name: '删除帖子',   description: '删除帖子' },
  { code: 'post.pin',             module: 'post',     name: '置顶帖子',   description: '置顶/取消置顶帖子' },
  { code: 'post.lock',            module: 'post',     name: '锁定帖子',   description: '锁定/解锁帖子' },

  // system
  { code: 'system.settings',      module: 'system',   name: '系统设置',   description: '修改系统设置' },
  { code: 'system.permission.manage', module: 'system', name: '权限管理',  description: '管理权限点/角色权限' },
  { code: 'admin.access',         module: 'system',   name: '进入管理后台', description: '访问 /admin/* 路由' },
]

/* ============================================================================
 * 2) 系统角色默认权限集
 * ========================================================================== */

// SYSTEM_ADMIN：全部权限点（脚本运行时动态从 PERMISSIONS 计算）
const SYSTEM_ADMIN_CODES: string[] = PERMISSIONS.map(p => p.code)

// TEACHER：业务管理类 + user.view|edit
const TEACHER_CODES: string[] = PERMISSIONS.filter(p => {
  if (p.code === 'user.view' || p.code === 'user.edit') return true
  if (p.module === 'class') return true
  if (p.module === 'problem') return true
  if (p.module === 'contest') return true
  if (p.module === 'training') return true
  if (p.module === 'post') return true
  return false
}).map(p => p.code)

// STUDENT：仅普通用户类
const STUDENT_CODES: string[] = PERMISSIONS.filter(p => {
  if (p.code === 'post.create' || p.code === 'post.edit') return true
  if (p.code === 'contest.participate.manage') return true
  return false
}).map(p => p.code)

/* ============================================================================
 * 3) 主流程
 * ========================================================================== */

async function main() {
  console.log('[seed-permissions] 开始写入权限点...')

  // 3.1 upsert 全部 Permission
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      create: {
        code: p.code,
        module: p.module,
        name: p.name,
        description: p.description ?? null,
      },
      update: {
        module: p.module,
        name: p.name,
        description: p.description ?? null,
      },
    })
  }
  console.log(`[seed-permissions] 已 upsert ${PERMISSIONS.length} 个权限点`)

  // 3.2 清空全部 RolePermission
  const deleted = await prisma.rolePermission.deleteMany({})
  console.log(`[seed-permissions] 已清空 RolePermission（${deleted.count} 条）`)

  // 3.3 查询所有 Permission，构建 code → id 映射
  const allPermissions = await prisma.permission.findMany({ select: { id: true, code: true } })
  const codeToId = new Map<string, string>()
  for (const p of allPermissions) {
    codeToId.set(p.code, p.id)
  }

  // 3.4 批量插入角色默认权限
  const roleCodeMap: Record<string, string[]> = {
    SYSTEM_ADMIN: SYSTEM_ADMIN_CODES,
    TEACHER: TEACHER_CODES,
    STUDENT: STUDENT_CODES,
  }

  const allRolePermissions: { role: string; permissionId: string }[] = []
  for (const [role, codes] of Object.entries(roleCodeMap)) {
    for (const code of codes) {
      const pid = codeToId.get(code)
      if (!pid) {
        console.warn(`[seed-permissions] 警告：权限点 ${code} 未找到，已跳过`)
        continue
      }
      allRolePermissions.push({ role, permissionId: pid })
    }
  }

  if (allRolePermissions.length > 0) {
    await prisma.rolePermission.createMany({ data: allRolePermissions })
  }

  const counts: Record<string, number> = {}
  for (const rp of allRolePermissions) {
    counts[rp.role] = (counts[rp.role] || 0) + 1
  }

  console.log(
    `[seed-permissions] 角色权限映射：` +
      `SYSTEM_ADMIN=${counts.SYSTEM_ADMIN ?? 0}, ` +
      `TEACHER=${counts.TEACHER ?? 0}, ` +
      `STUDENT=${counts.STUDENT ?? 0}`
  )
  console.log(
    `Seed 完成：${PERMISSIONS.length} 个权限点，${allRolePermissions.length} 个角色权限映射`
  )
}

main()
  .catch((err) => {
    console.error('[seed-permissions] 执行失败：', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
