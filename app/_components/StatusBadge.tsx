'use client'

export function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    '进行中': 'bg-primary/10 text-primary',
    '未开始': 'bg-muted text-muted-foreground',
    '已截止': 'bg-error/10 text-error',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colorMap[status] || 'bg-muted text-muted-foreground'}`}>
      {status}
    </span>
  )
}
