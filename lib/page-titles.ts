import { SITE_TITLE_SUFFIX } from '@/lib/document-title'

/** 与根 layout metadata 一致 */
export const DEFAULT_SITE_TITLE = `首页 - ${SITE_TITLE_SUFFIX}`

type TitleRule = {
  test: RegExp
  title: string | ((pathname: string, match: RegExpMatchArray) => string)
}

/** 静态路由与模式路由的浏览器标签标题（不含后缀时已带逻辑名） */
const RULES: TitleRule[] = [
  // 管理后台（更具体优先）
  { test: /^\/admin\/problems\/[^/]+\/testcases$/, title: '测试用例 - 题目管理' },
  { test: /^\/admin\/problems\/[^/]+\/edit$/, title: '编辑题目' },
  { test: /^\/admin\/problems\/create$/, title: '创建题目' },
  { test: /^\/admin\/problems\/review$/, title: '题目审核' },
  { test: /^\/admin\/problems\/source$/, title: '题目来源' },
  { test: /^\/admin\/problems$/, title: '题目管理' },
  { test: /^\/admin\/contests\/[^/]+\/edit$/, title: '编辑竞赛' },
  { test: /^\/admin\/contests\/create$/, title: '创建竞赛' },
  { test: /^\/admin\/contests$/, title: '竞赛管理' },
  { test: /^\/admin\/trainings\/categories$/, title: '题单分类' },
  { test: /^\/admin\/trainings\/create$/, title: '创建题单' },
  { test: /^\/admin\/trainings\/[^/]+$/, title: '题单管理' },
  { test: /^\/admin\/trainings$/, title: '题单管理' },
  { test: /^\/admin\/users\/[^/]+\/permissions$/, title: '用户权限' },
  { test: /^\/admin\/users$/, title: '用户管理' },
  { test: /^\/admin\/classes$/, title: '班级管理' },
  { test: /^\/admin\/submissions$/, title: '提交记录' },
  { test: /^\/admin\/announcements$/, title: '公告管理' },
  { test: /^\/admin\/settings$/, title: '系统设置' },
  { test: /^\/admin\/roles$/, title: '角色管理' },
  { test: /^\/admin\/permissions$/, title: '权限管理' },
  { test: /^\/admin\/ai-models$/, title: 'AI 模型' },
  { test: /^\/admin\/ai-generation$/, title: 'AI 出题' },
  { test: /^\/admin$/, title: '管理后台' },

  // 竞赛
  {
    test: /^\/contests\/[^/]+\/problems\/[^/]+$/,
    title: '竞赛题目',
  },
  { test: /^\/contests\/[^/]+\/problems$/, title: '竞赛题目列表' },
  { test: /^\/contests\/[^/]+\/submissions$/, title: '竞赛提交' },
  { test: /^\/contests\/[^/]+\/rank$/, title: '竞赛排名' },
  { test: /^\/contests\/[^/]+\/edit$/, title: '编辑竞赛' },
  { test: /^\/contests\/create$/, title: '创建竞赛' },
  { test: /^\/contests\/[^/]+$/, title: '竞赛详情' },
  { test: /^\/contests$/, title: '竞赛' },

  // 班级
  {
    test: /^\/classes\/[^/]+\/assignments\/[^/]+\/submissions$/,
    title: '作业提交',
  },
  { test: /^\/classes\/[^/]+\/assignments\/[^/]+\/edit$/, title: '编辑作业' },
  { test: /^\/classes\/[^/]+\/assignments\/create$/, title: '创建作业' },
  { test: /^\/classes\/[^/]+\/assignments\/[^/]+$/, title: '作业详情' },
  { test: /^\/classes\/[^/]+\/assignments$/, title: '班级作业' },
  { test: /^\/classes\/[^/]+\/problems\/create$/, title: '添加题目' },
  { test: /^\/classes\/[^/]+\/problems\/[^/]+$/, title: '班级题目' },
  { test: /^\/classes\/[^/]+\/problems$/, title: '班级题库' },
  { test: /^\/classes\/[^/]+\/members\/[^/]+\/activity$/, title: '成员动态' },
  { test: /^\/classes\/[^/]+\/members\/[^/]+\/permissions$/, title: '成员权限' },
  { test: /^\/classes\/[^/]+\/members$/, title: '班级成员' },
  { test: /^\/classes\/[^/]+\/notes\/create$/, title: '写笔记' },
  { test: /^\/classes\/[^/]+\/notes\/[^/]+$/, title: '笔记' },
  { test: /^\/classes\/[^/]+\/notes$/, title: '班级笔记' },
  { test: /^\/classes\/[^/]+\/invites$/, title: '班级邀请' },
  { test: /^\/classes\/[^/]+\/requests$/, title: '加入申请' },
  { test: /^\/classes\/[^/]+\/manage$/, title: '班级管理' },
  { test: /^\/classes\/[^/]+$/, title: '班级' },
  { test: /^\/classes\/create$/, title: '创建班级' },
  { test: /^\/classes\/invites\/direct\/[^/]+$/, title: '班级邀请' },
  { test: /^\/classes$/, title: '班级' },

  // 题库 / 题目 / 题解
  { test: /^\/problem\/[^/]+$/, title: '题目' },
  { test: /^\/problems\/[^/]+\/solutions\/new$/, title: '发布题解' },
  { test: /^\/problems\/[^/]+\/solutions\/[^/]+\/edit$/, title: '编辑题解' },
  { test: /^\/problems\/[^/]+\/solutions\/[^/]+$/, title: '题解' },
  { test: /^\/problems\/[^/]+\/solutions$/, title: '题解' },
  { test: /^\/problems$/, title: '题库' },

  // 训练
  { test: /^\/training\/create$/, title: '创建题单' },
  {
    test: /^\/training\/[^/]+\/problems\/[^/]+$/,
    title: '题单题目',
  },
  { test: /^\/training\/[^/]+$/, title: '题单' },
  { test: /^\/training$/, title: '训练' },

  // 其它
  { test: /^\/submission\/[^/]+$/, title: '提交详情' },
  { test: /^\/submissions$/, title: '提交记录' },
  { test: /^\/announcements\/[^/]+$/, title: '公告' },
  { test: /^\/announcements$/, title: '公告' },
  { test: /^\/user\/[^/]+$/, title: '用户主页' },
  { test: /^\/rank$/, title: '排行榜' },
  { test: /^\/notifications$/, title: '通知' },
  { test: /^\/profile$/, title: '个人资料' },
  { test: /^\/settings$/, title: '设置' },
  { test: /^\/login$/, title: '登录' },
  { test: /^\/register$/, title: '注册' },
  { test: /^\/forgot-password$/, title: '找回密码' },
  { test: /^\/403$/, title: '无权限' },
  { test: /^\/$/, title: '首页' },
]

/**
 * 根据 pathname 解析页面标题（短标题，不含站点后缀）
 */
export function resolvePageTitle(pathname: string): string {
  const path = pathname.split('?')[0].replace(/\/$/, '') || '/'

  for (const rule of RULES) {
    const m = path.match(rule.test)
    if (m) {
      return typeof rule.title === 'function' ? rule.title(path, m) : rule.title
    }
  }

  const segment = path.split('/').filter(Boolean).pop()
  return segment ? decodeURIComponent(segment) : '页面'
}

export function formatPageDocumentTitle(pageTitle: string): string {
  const name = pageTitle.trim() || '页面'
  return `${name} - ${SITE_TITLE_SUFFIX}`
}