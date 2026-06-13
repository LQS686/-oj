'use client'

/**
 * components/training/ProgressCircle.tsx
 * 圆形进度环（对标洛谷题单卡片的右上角圆环）
 */
interface ProgressCircleProps {
  solved: number
  total: number
  size?: number
  strokeWidth?: number
}

export function ProgressCircle({ solved, total, size = 56, strokeWidth = 4 }: ProgressCircleProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const percent = total > 0 ? Math.min(100, Math.max(0, (solved / total) * 100)) : 0
  const dashOffset = circumference * (1 - percent / 100)
  const isComplete = total > 0 && solved >= total
  const isInProgress = solved > 0 && !isComplete

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        {/* 背景圆 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-primary/15"
        />
        {/* 进度圆 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className={isComplete ? 'text-success' : isInProgress ? 'text-primary' : 'text-primary/30'}
          style={{ transition: 'stroke-dashoffset 0.4s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-semibold text-foreground">
          {solved}
          <span className="text-muted-foreground mx-0.5">/</span>
          {total}
        </span>
      </div>
    </div>
  )
}

export default ProgressCircle
