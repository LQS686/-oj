'use client'

export function UtilizationBar({ active, max }: { active: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (active / max) * 100) : 0
  const colorClass = pct >= 90 ? 'bg-error' : pct >= 50 ? 'bg-warning' : 'bg-success'
  return (
    <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
      <div
        className={`h-full ${colorClass} transition-all duration-300`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
