/**
 * 积分规则计算工具库
 * 定义各种积分获取规则和计算逻辑
 */

/**
 * 积分规则配置
 */
export const POINTS_RULES = {
  // 作业完成积分规则（根据题目难度）
  ASSIGNMENT_COMPLETION: {
    EASY: 10,
    MEDIUM: 20,
    HARD: 30,
    VERY_HARD: 50
  },

  // 笔记阅读积分
  NOTE_READ: {
    FIRST_READ: 5
  },

  // 课堂表现积分（由教师评估）
  CLASS_PERFORMANCE: {
    MIN: 1,
    MAX: 100,
    DEFAULT: 10
  },

  // 每日签到积分
  DAILY_CHECKIN: {
    BASE: 5,
    CONTINUOUS_BONUS: 2 // 连续签到每天额外奖励
  },

  // 班级贡献积分
  CONTRIBUTION: {
    CREATE_NOTE: 10,
    HELP_OTHERS: 5
  }
}

/**
 * 计算作业完成积分
 */
export function calculateAssignmentPoints(difficulty: string): number {
  const difficultyUpper = difficulty.toUpperCase()
  
  switch (difficultyUpper) {
    case 'EASY':
    case '入门':
      return POINTS_RULES.ASSIGNMENT_COMPLETION.EASY
    case 'MEDIUM':
    case '普及-':
    case '普及/提高-':
      return POINTS_RULES.ASSIGNMENT_COMPLETION.MEDIUM
    case 'HARD':
    case '普及+/提高':
    case '提高+/省选-':
      return POINTS_RULES.ASSIGNMENT_COMPLETION.HARD
    case 'VERY_HARD':
    case '省选/NOI-':
    case 'NOI/NOI+/CTSC':
      return POINTS_RULES.ASSIGNMENT_COMPLETION.VERY_HARD
    default:
      return POINTS_RULES.ASSIGNMENT_COMPLETION.EASY
  }
}

/**
 * 计算笔记阅读积分
 */
export function calculateNoteReadPoints(): number {
  return POINTS_RULES.NOTE_READ.FIRST_READ
}

/**
 * 验证课堂表现积分是否有效
 */
export function validateClassPerformancePoints(points: number): boolean {
  return (
    points >= POINTS_RULES.CLASS_PERFORMANCE.MIN &&
    points <= POINTS_RULES.CLASS_PERFORMANCE.MAX
  )
}

/**
 * 计算连续签到奖励
 */
export function calculateCheckinPoints(consecutiveDays: number): number {
  const basePoints = POINTS_RULES.DAILY_CHECKIN.BASE
  const bonusPoints = Math.min(consecutiveDays - 1, 7) * POINTS_RULES.DAILY_CHECKIN.CONTINUOUS_BONUS
  return basePoints + bonusPoints
}

/**
 * 获取积分来源类型说明
 */
export function getSourceTypeDescription(sourceType: string): string {
  const descriptions: Record<string, string> = {
    'ASSIGNMENT_COMPLETION': '完成作业',
    'NOTE_READ': '阅读笔记',
    'CLASS_PERFORMANCE': '课堂表现',
    'DAILY_CHECKIN': '每日签到',
    'CREATE_NOTE': '创建笔记',
    'MANUAL_AWARD': '手动发放',
    'MANUAL_DEDUCT': '手动扣除',
    'SHOP_EXCHANGE': '商城兑换',
    'REFUND': '退款'
  }
  return descriptions[sourceType] || sourceType
}

/**
 * 生成积分变动描述
 */
export function generatePointsDescription(
  type: 'EARN' | 'SPEND' | 'DEDUCT' | 'REFUND',
  sourceType: string,
  points: number,
  extra?: any
): string {
  const sourceDesc = getSourceTypeDescription(sourceType)

  switch (type) {
    case 'EARN':
      if (sourceType === 'ASSIGNMENT_COMPLETION' && extra?.problemTitle) {
        return `完成作业题目「${extra.problemTitle}」获得 ${points} 积分`
      }
      if (sourceType === 'NOTE_READ' && extra?.noteTitle) {
        return `首次阅读笔记「${extra.noteTitle}」获得 ${points} 积分`
      }
      if (sourceType === 'CLASS_PERFORMANCE') {
        return `课堂表现优秀获得 ${points} 积分`
      }
      return `通过${sourceDesc}获得 ${points} 积分`

    case 'SPEND':
      if (sourceType === 'SHOP_EXCHANGE' && extra?.itemName) {
        return `兑换商品「${extra.itemName}」花费 ${points} 积分`
      }
      return `${sourceDesc}花费 ${points} 积分`

    case 'DEDUCT':
      return `被扣除 ${points} 积分 - ${extra?.reason || '管理员操作'}`

    case 'REFUND':
      return `退款 ${points} 积分`

    default:
      return `积分变动 ${points}`
  }
}
