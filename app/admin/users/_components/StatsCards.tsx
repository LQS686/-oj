'use client'

import { TrendingUp } from 'lucide-react'
import type { User } from '../_utils'
import { getRoleDisplay, getWeeklyGrowth, ROLE_ORDER, ROLE_BAR_COLOR } from '../_utils'

/**
 * 顶部统计卡：总用户数（含本周增长） + 角色分布条形图。
 */
export function StatsCards({ users }: { users: User[] }) {
  const weeklyGrowth = getWeeklyGrowth(users)

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="card p-4">
        <div className="text-muted-foreground text-sm">总用户数</div>
        <div className="text-3xl font-bold text-foreground mt-1">{users.length}</div>
        {weeklyGrowth > 0 && (
          <div className="text-xs text-secondary-light mt-2 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            本周新增 {weeklyGrowth} 人
          </div>
        )}
      </div>
      <div className="card p-4">
        <div className="text-muted-foreground text-sm mb-2">角色分布</div>
        <div className="space-y-2">
          {ROLE_ORDER.map(role => {
            const count = users.filter(u => u.role === role).length
            const percent = users.length > 0 ? (count / users.length) * 100 : 0
            const display = getRoleDisplay(role)
            const barColor = ROLE_BAR_COLOR[role] || 'bg-primary'
            return (
              <div key={role} className="flex items-center gap-2">
                <div className="w-20 text-xs text-muted-foreground shrink-0">{display.label}</div>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full ${barColor} transition-all duration-300`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <div className="w-20 text-xs text-foreground text-right shrink-0">
                  {count} <span className="text-muted-foreground">({percent.toFixed(0)}%)</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
