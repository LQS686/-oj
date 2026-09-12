'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { ActivityData } from '@/types/models'

/**
 * 用户主页「近 7 天通过」面积图。
 *
 * 单独成一个文件是为了让页面用 next/dynamic 懒加载：
 * recharts 的首屏 JS 约 348KB（未压缩），而这张图在侧栏、首屏之后才可见，
 * 没有理由让它进入首屏包。
 */
export default function ActivityChart({ data }: { data: ActivityData[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="profileAcFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="date"
          axisLine={false}
          tickLine={false}
          tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
          width={28}
          tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
        />
        <Tooltip
          contentStyle={{
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--card)',
            color: 'var(--foreground)',
            fontSize: 12,
          }}
          labelStyle={{ color: 'var(--muted-foreground)' }}
        />
        <Area
          type="monotone"
          dataKey="count"
          name="通过"
          stroke="var(--primary)"
          strokeWidth={2}
          fill="url(#profileAcFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
