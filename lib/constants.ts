export const DIFFICULTIES = ['入门', '普及-', '普及', '普及+', '提高', '提高+', '省选', 'NOI'] as const

export const DIFFICULTY_COLORS: Record<string, string> = {
  '入门': 'difficulty-easy',
  '普及-': 'difficulty-medium-easy',
  '普及': 'difficulty-medium-easy',
  '普及+': 'difficulty-medium',
  '提高': 'difficulty-medium',
  '提高+': 'difficulty-medium-hard',
  '省选': 'difficulty-hard',
  'NOI': 'difficulty-expert',
}
