'use client'

export function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    '进行中': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    '未开始': 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    '已截止': 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colorMap[status] || 'bg-muted text-muted-foreground'}`}>
      {status}
    </span>
  )
}
