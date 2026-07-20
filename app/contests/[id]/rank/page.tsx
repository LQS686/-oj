'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { AlertCircle, Medal, RefreshCw, Download, Lock, Unlock } from 'lucide-react'
import { fetchWithCookie } from '@/lib/api/base'
import { useUser } from '@/contexts/UserContext'

interface RankItem {
  rank: number
  user: {
    id: string
    username: string
    nickname: string
    avatar?: string
  }
  solved: number
  totalScore: number
  penalty: number
  penaltyMinutes: number
  problems: Record<string, {
    status: string
    time: number
    tries: number
    score: number
  }>
}

interface ContestProblem {
  id: string
  title: string
  problemNumber: string
  orderIndex: number
}

// 封榜状态信息（来自后端 seal 字段）
interface SealInfo {
  sealed: boolean
  sealRankTime: string | null
  sealUnlocked: boolean
  isFrozenView: boolean
}

// 题号气球颜色调色板（参考 HOJ disPlayIdMapColor）
// 用于排名表头题号背景色与状态格边框，让用户快速识别"哪题是哪题"
const PROBLEM_COLORS = [
  { bg: 'bg-red-500/15', text: 'text-red-600 dark:text-red-400', border: 'border-red-500/30' },
  { bg: 'bg-orange-500/15', text: 'text-orange-600 dark:text-orange-400', border: 'border-orange-500/30' },
  { bg: 'bg-amber-500/15', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-500/30' },
  { bg: 'bg-lime-500/15', text: 'text-lime-600 dark:text-lime-400', border: 'border-lime-500/30' },
  { bg: 'bg-emerald-500/15', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500/30' },
  { bg: 'bg-cyan-500/15', text: 'text-cyan-600 dark:text-cyan-400', border: 'border-cyan-500/30' },
  { bg: 'bg-blue-500/15', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-500/30' },
  { bg: 'bg-violet-500/15', text: 'text-violet-600 dark:text-violet-400', border: 'border-violet-500/30' },
  { bg: 'bg-fuchsia-500/15', text: 'text-fuchsia-600 dark:text-fuchsia-400', border: 'border-fuchsia-500/30' },
  { bg: 'bg-pink-500/15', text: 'text-pink-600 dark:text-pink-400', border: 'border-pink-500/30' },
  { bg: 'bg-teal-500/15', text: 'text-teal-600 dark:text-teal-400', border: 'border-teal-500/30' },
  { bg: 'bg-indigo-500/15', text: 'text-indigo-600 dark:text-indigo-400', border: 'border-indigo-500/30' },
]

function getProblemColor(index: number) {
  return PROBLEM_COLORS[index % PROBLEM_COLORS.length]
}

// 自动刷新间隔选项（参考 HOJ ACMContestRank.vue 自动刷新开关）
const REFRESH_INTERVALS = [
  { label: '关闭', value: 0 },
  { label: '10s', value: 10000 },
  { label: '30s', value: 30000 },
  { label: '1min', value: 60000 },
  { label: '3min', value: 180000 },
]

export default function ContestRankPage() {
  const params = useParams()
  const { user } = useUser()
  const [rankings, setRankings] = useState<RankItem[]>([])
  const [problems, setProblems] = useState<ContestProblem[]>([])
  const [contestType, setContestType] = useState<string>('OI')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshInterval, setRefreshInterval] = useState(30000)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 封榜状态
  const [seal, setSeal] = useState<SealInfo | null>(null)
  const [unsealing, setUnsealing] = useState(false)

  // 是否管理员（用于显示"解冻"按钮）
  const isAdmin = user?.role === 'SYSTEM_ADMIN' || user?.role === 'ADMIN'

  const fetchRank = async (silent = false) => {
    try {
      if (!silent) setIsRefreshing(true)
      const res = await fetchWithCookie(`/api/contests/${params.id}/rank`)
      const data = await res.json()

      if (data.success) {
        setRankings(data.data.rankings || [])
        setProblems(data.data.problems || [])
        if (data.data.contestType) {
          setContestType(data.data.contestType)
        }
        if (data.data.seal) {
          setSeal(data.data.seal)
        }
        setLastUpdated(new Date())
      } else {
        if (!silent) setError(data.error)
      }
    } catch (err) {
      if (!silent) setError('加载失败')
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }

  // 管理员手动解冻封榜
  const handleUnseal = async () => {
    if (!confirm('确认解冻封榜？解冻后所有用户将看到完整实时排名。')) return
    setUnsealing(true)
    try {
      const res = await fetchWithCookie(`/api/admin/contests/${params.id}/unseal`, {
        method: 'POST',
      })
      const data = await res.json()
      if (data.success) {
        await fetchRank(true)
      } else {
        alert(data.error || '解冻失败')
      }
    } catch (err) {
      alert('网络错误')
    } finally {
      setUnsealing(false)
    }
  }

  // 格式化封榜时间
  const formatSealTime = (iso: string | null) => {
    if (!iso) return ''
    try {
      return new Date(iso).toLocaleString('zh-CN', { hour12: false })
    } catch {
      return ''
    }
  }

  // 自动刷新（参考 HOJ 自动刷新开关，但增加"关闭"选项避免无谓请求）
  useEffect(() => {
    // 初次加载
    fetchRank()

    // 清理上一次的定时器
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    // 设置新的定时器（仅当 refreshInterval > 0）
    if (refreshInterval > 0) {
      intervalRef.current = setInterval(() => {
        // 后台静默刷新，不显示 loading 状态
        if (document.visibilityState === 'visible') {
          fetchRank(true)
        }
      }, refreshInterval)
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // 恢复前台时立即刷新一次
        fetchRank(true)
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [refreshInterval])

  const formatTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const formatTimeMinutes = (ms: number) => {
    return Math.floor(ms / 60000)
  }

  const getRankStyle = (rank: number) => {
    if (rank === 1) return 'bg-gradient-to-br from-accent/20 to-accent-dark/20 text-accent-light border border-accent/30'
    if (rank === 2) return 'bg-gradient-to-br from-muted/20 to-muted/40 text-muted-foreground border border-muted/30'
    if (rank === 3) return 'bg-primary/20 text-primary-light border border-primary/30'
    return 'bg-muted text-muted-foreground'
  }

  // CSV 导出（参考 HOJ ACMContestRank.vue 的 CSV 导出按钮，纯前端实现无新依赖）
  const exportCSV = () => {
    if (rankings.length === 0) return

    const headers = ['排名', '用户名', '昵称', contestType === 'ACM' ? '解决数' : '总分', '罚时(min)']
    problems.forEach((p, idx) => {
      headers.push(String.fromCharCode(65 + idx))
    })

    const rows = rankings.map(item => {
      const row = [
        item.rank,
        item.user.username,
        item.user.nickname || '',
        contestType === 'ACM' ? item.solved : item.totalScore,
        item.penaltyMinutes,
      ]
      problems.forEach(p => {
        const ps = item.problems[p.id]
        if (!ps || ps.status === 'Unsubmitted') {
          row.push('-')
        } else if (contestType === 'ACM') {
          row.push(ps.status === 'AC' ? `+${ps.tries > 0 ? ps.tries : ''}` : `-${ps.tries}`)
        } else {
          row.push(ps.score)
        }
      })
      return row
    })

    // CSV 转义：含逗号/引号/换行的字段用双引号包裹
    const escape = (v: any) => {
      const s = String(v)
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
      return s
    }

    const csv = [headers, ...rows].map(r => r.map(escape).join(',')).join('\n')
    // 加 BOM 让 Excel 正确识别 UTF-8
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `contest-${params.id}-rank-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading && rankings.length === 0) return (
    <div className="card rounded-lg p-8">
      <div className="space-y-4">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="skeleton h-14 rounded-xl"></div>
        ))}
      </div>
    </div>
  )

  if (error) return (
    <div className="card rounded-lg p-12 text-center">
      <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-6">
        <AlertCircle className="w-8 h-8 text-error" />
      </div>
      <p className="text-error text-lg font-medium">{error}</p>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* 封榜状态横幅（参考 HOJ ContestRank.vue sealRank 提示） */}
      {seal && seal.sealed && (
        <div className={`card rounded-lg p-4 flex items-center justify-between gap-3 border ${
          seal.isFrozenView
            ? 'border-accent/30 bg-accent/5'
            : 'border-primary/30 bg-primary/5'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
              seal.isFrozenView ? 'bg-accent/15 text-accent-light' : 'bg-primary/15 text-primary-light'
            }`}>
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-foreground flex items-center gap-2">
                {seal.isFrozenView ? '封榜中 — 你看到的是封榜快照' : '封榜中 — 管理员视角（实时数据）'}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                封榜时间：{formatSealTime(seal.sealRankTime)}
                {seal.sealUnlocked && <span className="ml-2 text-secondary">· 已解冻</span>}
              </div>
            </div>
          </div>
          {isAdmin && !seal.sealUnlocked && (
            <button
              onClick={handleUnseal}
              disabled={unsealing}
              className="btn btn-ghost px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5 border border-primary/30 hover:bg-primary/10"
              title="管理员手动解冻封榜"
            >
              <Unlock className="w-4 h-4" />
              {unsealing ? '解冻中...' : '解冻'}
            </button>
          )}
        </div>
      )}

      {/* 工具栏：自动刷新选择 + 手动刷新 + CSV 导出 + 最后更新时间 */}
      <div className="card rounded-lg p-3 flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">自动刷新</span>
          <div className="flex items-center gap-1">
            {REFRESH_INTERVALS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setRefreshInterval(opt.value)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                  refreshInterval === opt.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary-light'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-muted-foreground">
              最后更新：{lastUpdated.toLocaleTimeString('zh-CN', { hour12: false })}
            </span>
          )}
          <button
            onClick={() => fetchRank()}
            disabled={isRefreshing}
            className="btn btn-ghost px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5"
            title="手动刷新"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            刷新
          </button>
          <button
            onClick={exportCSV}
            className="btn btn-ghost px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5"
            title="导出 CSV"
          >
            <Download className="w-3.5 h-3.5" />
            导出
          </button>
        </div>
      </div>

      <div className="card rounded-lg overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-16 sticky left-0 bg-background-secondary z-10">
                  排名
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-48 sticky left-16 bg-background-secondary z-10">
                  用户
                </th>
                <th className="px-4 py-4 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider w-24">
                  {contestType === 'ACM' ? '解决' : '分数'}
                </th>
                {problems.map((p, index) => {
                  const color = getProblemColor(index)
                  return (
                    <th key={p.id} className={`px-4 py-4 text-center min-w-[80px] border-b-2 ${color.border}`}>
                      <div className={`inline-flex items-center justify-center w-8 h-8 rounded-lg font-bold ${color.bg} ${color.text}`}>
                        {String.fromCharCode(65 + index)}
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rankings.map((item) => (
                <tr key={item.user.id} className="hover:bg-primary/5 transition-colors">
                  <td className="px-4 py-4 whitespace-nowrap sticky left-0 bg-background z-10">
                    <div className={`flex items-center justify-center w-9 h-9 rounded-xl font-bold text-sm ${getRankStyle(item.rank)}`}>
                      {item.rank <= 3 ? (
                        <Medal className="w-4 h-4" />
                      ) : (
                        item.rank
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap sticky left-16 bg-background z-10">
                    <div className="flex items-center gap-3">
                      <div className="avatar avatar-md">
                        {item.user.avatar ? (
                          <img src={item.user.avatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="avatar-fallback text-sm">
                            {item.user.nickname?.[0] || item.user.username?.[0] || '?'}
                          </div>
                        )}
                      </div>
                      <div className="font-medium text-foreground">
                        {item.user.nickname || item.user.username}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-center">
                    <div className="font-bold text-primary-light text-lg">
                      {item.totalScore !== undefined ? item.totalScore : item.solved}
                    </div>
                    {contestType === 'ACM' && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {formatTimeMinutes(item.penalty)} min
                      </div>
                    )}
                  </td>
                  {problems.map((p, pIdx) => {
                    const pStats = item.problems[p.id]
                    if (!pStats || pStats.status === 'Unsubmitted') {
                      return <td key={p.id} className="px-4 py-4 text-center text-muted-foreground/50">-</td>
                    }

                    const color = getProblemColor(pIdx)

                    if (contestType === 'ACM') {
                      if (pStats.status === 'AC') {
                        return (
                          <td key={p.id} className={`px-4 py-4 text-center bg-secondary/10 border-l-2 ${color.border}`}>
                            <div className="text-secondary-light font-bold">
                              +{pStats.tries > 0 ? pStats.tries : ''}
                            </div>
                            <div className="text-xs text-secondary-light/70">
                              {formatTime(pStats.time)}
                            </div>
                          </td>
                        )
                      }
                      return (
                        <td key={p.id} className={`px-4 py-4 text-center bg-error/10 border-l-2 ${color.border}`}>
                          <div className="text-error font-bold">
                            -{pStats.tries}
                          </div>
                        </td>
                      )
                    }

                    const isAc = pStats.score === 100
                    const isZero = pStats.score === 0
                    return (
                      <td key={p.id} className={`px-4 py-4 text-center ${isAc ? 'bg-secondary/10' : isZero ? 'bg-error/10' : 'bg-accent/10'} border-l-2 ${color.border}`}>
                        <div className={`font-bold ${isAc ? 'text-secondary-light' : isZero ? 'text-error' : 'text-accent-light'}`}>
                          {pStats.score}
                        </div>
                        {pStats.time > 0 && (
                          <div className={`text-xs ${isAc ? 'text-secondary-light/70' : isZero ? 'text-error/70' : 'text-accent-light/70'}`}>
                            {formatTimeMinutes(pStats.time)} min
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
