export const DIFFICULTIES = ['入门', '普及-', '普及', '普及+', '提高', '提高+', '省选', 'NOI'] as const

export const DIFFICULTY_COLORS: Record<string, string> = {
  '入门': 'text-green-400 bg-green-400/10',
  '普及-': 'text-green-400 bg-green-400/10',
  '普及': 'text-blue-400 bg-blue-400/10',
  '普及+': 'text-blue-400 bg-blue-400/10',
  '提高': 'text-yellow-400 bg-yellow-400/10',
  '提高+': 'text-yellow-400 bg-yellow-400/10',
  '省选': 'text-orange-400 bg-orange-400/10',
  'NOI': 'text-red-400 bg-red-400/10',
}

export const DIFFICULTY_ORDER = DIFFICULTIES

export type Difficulty = typeof DIFFICULTIES[number]
