/**
 * 难度体系（对齐洛谷 8 档权威定义）
 * 参考：https://help.luogu.com.cn/manual/luogu/problem/difficulty
 *
 * 这是全站唯一的难度真相源——所有业务校验、前端表单
 * 必须从本文件导入 DIFFICULTIES / Difficulty / isValidDifficulty，
 * 不得在其他文件硬编码难度列表。
 */

/** 评测支持的提交语言（与前端 WORKSPACE_LANGUAGE_OPTIONS 保持一致） */
export const ALLOWED_LANGUAGES = ['cpp', 'c', 'python'] as const
export type AllowedLanguage = (typeof ALLOWED_LANGUAGES)[number]

/** 代码长度上限（普通提交与竞赛提交共用） */
export const MAX_CODE_LENGTH = 50000

/** 难度档位（由易到难，对齐洛谷命名） */
export const DIFFICULTIES = [
  '入门',      // 红色 Red
  '普及-',     // 橙色 Orange
  '普及',      // 黄色 Yellow
  '普及+',     // 绿色 Green（洛谷全称"普及+/提高-"，此处简化为"普及+"）
  '提高',      // 青色 Cyan
  '提高+',     // 蓝色 Blue（洛谷全称"提高+/省选-"，此处简化为"提高+"）
  '省选',      // 紫色 Purple（洛谷全称"省选/NOI-"，此处简化为"省选"）
  'NOI',       // 黑色 Black（洛谷全称"NOI/NOI+/CTS"）
] as const

/** 难度类型 */
export type Difficulty = typeof DIFFICULTIES[number]

/** 难度档位颜色 CSS 类名（对齐洛谷官方颜色） */
export const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  '入门': 'difficulty-easy',           // 红
  '普及-': 'difficulty-medium-easy',    // 橙
  '普及': 'difficulty-medium-easy',     // 黄
  '普及+': 'difficulty-medium',         // 绿
  '提高': 'difficulty-medium',           // 青
  '提高+': 'difficulty-medium-hard',    // 蓝
  '省选': 'difficulty-hard',            // 紫
  'NOI': 'difficulty-expert',           // 黑
}

/** 难度档位对应的洛谷颜色名（用于 UI 展示） */
export const DIFFICULTY_LABELS: Record<Difficulty, { color: string; cn: string }> = {
  '入门':  { color: '红', cn: '入门' },
  '普及-': { color: '橙', cn: '普及-' },
  '普及':  { color: '黄', cn: '普及' },
  '普及+': { color: '绿', cn: '普及+' },
  '提高':  { color: '青', cn: '提高' },
  '提高+': { color: '蓝', cn: '提高+' },
  '省选':  { color: '紫', cn: '省选' },
  'NOI':   { color: '黑', cn: 'NOI' },
}

/**
 * 校验难度值是否合法（8 档之一）
 * @param value 待校验的字符串
 * @returns 是否为合法难度档位
 */
export function isValidDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string' && (DIFFICULTIES as readonly string[]).includes(value)
}

/**
 * 将任意难度值规范化为合法难度档位
 * - 合法值直接返回
 * - 非法值返回 fallback（默认 '入门'）
 */
export function normalizeDifficulty(value: unknown, fallback: Difficulty = '入门'): Difficulty {
  return isValidDifficulty(value) ? value : fallback
}
