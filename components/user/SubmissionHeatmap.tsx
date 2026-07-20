'use client'

/**
 * 提交日历热力图（参考 GitHub Contribution Graph + HOJ 用户主页活跃度热力图）
 *
 * 数据来源：/api/users/[id]/stats 返回的 activity.lastYear 字段
 *   格式：{ 'YYYY-MM-DD': count }
 *
 * 设计要点：
 *   - 纯 React + Tailwind 实现，无新依赖
 *   - 7 行（周日到周六）× ~53 列（周）网格
 *   - 5 个颜色等级，颜色随提交数加深（参考 GitHub 但使用项目主色）
 *   - 月份标签自动对齐到该月的第一个完整周
 *   - 悬停 tooltip 显示日期与提交数
 *   - 响应式：小屏可横向滚动
 */
import { useMemo, useState } from 'react'

export interface SubmissionHeatmapProps {
  /** 数据：{ 'YYYY-MM-DD': count } */
  data: Record<string, number>
  /** 显示天数（默认 365） */
  days?: number
  /** 用户主色（CSS 颜色，用于生成热力图色阶） */
  color?: string
}

interface DayCell {
  date: string // YYYY-MM-DD
  count: number
  month: number // 0-11
  dayOfWeek: number // 0-6 (Sun-Sat)
}

// 5 个颜色等级：从无活动到高活动
// 使用 CSS 变量保持主题一致性，level 0 使用 muted 灰色，1-4 使用主色不同透明度
const LEVEL_BG = [
  'bg-muted/40',
  'bg-primary/25',
  'bg-primary/50',
  'bg-primary/75',
  'bg-primary',
]

const LEVEL_BORDER = [
  'border-border/40',
  'border-primary/30',
  'border-primary/50',
  'border-primary/70',
  'border-primary',
]

/**
 * 根据提交数返回颜色等级（0-4）
 * 阈值参考 GitHub：0=无, 1=低, 2-3=中, 4-5=高, 6+=极高
 */
function getLevel(count: number): number {
  if (count <= 0) return 0
  if (count === 1) return 1
  if (count <= 3) return 2
  if (count <= 5) return 3
  return 4
}

/**
 * 格式化日期为 YYYY-MM-DD（本地时区，避免 UTC 偏移问题）
 */
function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 构建热力图网格：以"今天所在周的周日"为终点，向前推 N 天
 * 返回二维数组：外层是周（列），内层是 7 天（行，周日到周六）
 */
function buildGrid(data: Record<string, number>, totalDays: number): DayCell[][] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // 找到本周周日（终点）
  const endSunday = new Date(today)
  endSunday.setDate(today.getDate() - today.getDay())

  // 起点：从 endSunday 向前推 totalDays 天，再对齐到周日
  const start = new Date(endSunday)
  start.setDate(endSunday.getDate() - totalDays + 1)
  start.setDate(start.getDate() - start.getDay()) // 对齐到周日

  const weeks: DayCell[][] = []
  const cursor = new Date(start)
  while (cursor <= endSunday) {
    const week: DayCell[] = []
    for (let i = 0; i < 7; i++) {
      const dateStr = formatDate(cursor)
      const inRange = cursor <= today && cursor >= new Date(today.getTime() - totalDays * 24 * 60 * 60 * 1000)
      week.push({
        date: dateStr,
        count: inRange ? (data[dateStr] || 0) : 0,
        month: cursor.getMonth(),
        dayOfWeek: cursor.getDay(),
      })
      cursor.setDate(cursor.getDate() + 1)
    }
    weeks.push(week)
  }
  return weeks
}

/**
 * 月份缩写（中文）
 */
const MONTH_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

/**
 * 工作日标签（左侧）
 */
const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']

export default function SubmissionHeatmap({
  data,
  days = 365,
}: SubmissionHeatmapProps) {
  const [hovered, setHovered] = useState<DayCell | null>(null)

  const weeks = useMemo(() => buildGrid(data, days), [data, days])

  // 月份标签：遍历每一周，若该周第一天属于新月份则记录
  const monthLabels = useMemo(() => {
    const labels: { col: number; label: string }[] = []
    let lastMonth = -1
    weeks.forEach((week, col) => {
      const firstDay = week[0]
      if (firstDay.month !== lastMonth && firstDay.dayOfWeek === 0) {
        labels.push({ col, label: MONTH_LABELS[firstDay.month] })
        lastMonth = firstDay.month
      }
    })
    return labels
  }, [weeks])

  // 统计：总提交数、活跃天数、最长连续、当前连续
  const stats = useMemo(() => {
    let totalSubmissions = 0
    let activeDays = 0
    let maxStreak = 0
    let currentStreak = 0
    let tempStreak = 0
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    weeks.forEach((week) => {
      week.forEach((cell) => {
        if (cell.count > 0) {
          totalSubmissions += cell.count
          activeDays++
          tempStreak++
          if (tempStreak > maxStreak) maxStreak = tempStreak
        } else {
          tempStreak = 0
        }
      })
    })

    // 当前连续：从今天向前数
    const allCells: DayCell[] = weeks.flat().filter((c) => c.date <= formatDate(today))
    for (let i = allCells.length - 1; i >= 0; i--) {
      if (allCells[i].count > 0) {
        currentStreak++
      } else {
        break
      }
    }

    return { totalSubmissions, activeDays, maxStreak, currentStreak }
  }, [weeks])

  return (
    <div className="space-y-4">
      {/* 顶部统计概览 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card-static p-3 rounded-lg text-center">
          <div className="text-xl font-bold text-foreground tabular-nums">{stats.totalSubmissions}</div>
          <div className="text-xs text-muted-foreground mt-1">年度提交</div>
        </div>
        <div className="card-static p-3 rounded-lg text-center">
          <div className="text-xl font-bold text-foreground tabular-nums">{stats.activeDays}</div>
          <div className="text-xs text-muted-foreground mt-1">活跃天数</div>
        </div>
        <div className="card-static p-3 rounded-lg text-center">
          <div className="text-xl font-bold text-secondary-light tabular-nums">{stats.maxStreak}</div>
          <div className="text-xs text-muted-foreground mt-1">最长连续</div>
        </div>
        <div className="card-static p-3 rounded-lg text-center">
          <div className="text-xl font-bold text-primary-light tabular-nums">{stats.currentStreak}</div>
          <div className="text-xs text-muted-foreground mt-1">当前连续</div>
        </div>
      </div>

      {/* 热力图主体 */}
      <div className="relative overflow-x-auto custom-scrollbar pb-2">
        <div className="inline-flex flex-col gap-2 min-w-max">
          {/* 月份标签行 */}
          <div className="flex gap-[3px] pl-6">
            {weeks.map((_, col) => {
              const label = monthLabels.find((m) => m.col === col)
              return (
                <div
                  key={col}
                  className="w-[12px] text-[10px] text-muted-foreground leading-none h-3 flex items-end"
                >
                  {label ? <span className="whitespace-nowrap">{label.label}</span> : ''}
                </div>
              )
            })}
          </div>

          {/* 主网格：左侧工作日标签 + 7行 × N列格子 */}
          <div className="flex gap-1">
            {/* 工作日标签列 */}
            <div className="flex flex-col gap-[3px] w-5 justify-between pt-[2px]">
              {WEEKDAY_LABELS.map((label, i) => (
                <div
                  key={i}
                  className="h-[12px] text-[10px] text-muted-foreground leading-none flex items-center"
                >
                  {i % 2 === 1 ? label : ''}
                </div>
              ))}
            </div>

            {/* 格子网格 */}
            <div className="flex gap-[3px]">
              {weeks.map((week, col) => (
                <div key={col} className="flex flex-col gap-[3px]">
                  {week.map((cell) => {
                    const level = getLevel(cell.count)
                    return (
                      <div
                        key={cell.date}
                        className={`w-[12px] h-[12px] rounded-[2px] border ${LEVEL_BG[level]} ${LEVEL_BORDER[level]} hover:ring-1 hover:ring-primary/40 hover:scale-125 transition-transform cursor-default`}
                        onMouseEnter={() => setHovered(cell)}
                        onMouseLeave={() => setHovered(null)}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* 图例 */}
          <div className="flex items-center justify-end gap-2 mt-1 pl-6">
            <span className="text-[10px] text-muted-foreground">较少</span>
            {LEVEL_BG.map((bg, i) => (
              <div
                key={i}
                className={`w-[12px] h-[12px] rounded-[2px] border ${bg} ${LEVEL_BORDER[i]}`}
              />
            ))}
            <span className="text-[10px] text-muted-foreground">较多</span>
          </div>
        </div>

        {/* 悬停 tooltip */}
        {hovered && (
          <div className="absolute top-0 right-0 pointer-events-none px-3 py-2 rounded-md bg-background-secondary border border-border shadow-lg text-xs text-foreground z-10">
            <div className="font-medium">{hovered.date}</div>
            <div className="text-muted-foreground mt-0.5">
              {hovered.count > 0 ? `${hovered.count} 次提交` : '无提交'}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
