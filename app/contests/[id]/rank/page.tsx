'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Trophy, AlertCircle, Medal } from 'lucide-react'

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

export default function ContestRankPage() {
  const params = useParams()
  const [rankings, setRankings] = useState<RankItem[]>([])
  const [problems, setProblems] = useState<ContestProblem[]>([])
  const [contestType, setContestType] = useState<string>('OI')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchRank()
    const timer = setInterval(fetchRank, 30000)
    return () => clearInterval(timer)
  }, [])

  const fetchRank = async () => {
    try {
      const res = await fetch(`/api/contests/${params.id}/rank`)
      const data = await res.json()
      
      if (data.success) {
        setRankings(data.data.rankings || [])
        setProblems(data.data.problems || [])
        if (data.data.contestType) {
            setContestType(data.data.contestType)
        }
      } else {
        setError(data.error)
        setRankings([])
        setProblems([])
      }
    } catch (err) {
      setError('加载失败')
      setRankings([])
      setProblems([])
    } finally {
      setLoading(false)
    }
  }

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
    if (rank === 3) return 'bg-gradient-to-br from-primary/20 to-primary-dark/20 text-primary-light border border-primary/30'
    return 'bg-muted/50 text-muted-foreground'
  }

  if (loading && rankings.length === 0) return (
    <div className="card rounded-2xl p-8">
      <div className="space-y-4">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="skeleton h-14 rounded-xl"></div>
        ))}
      </div>
    </div>
  )

  if (error) return (
    <div className="card rounded-2xl p-12 text-center">
      <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-6">
        <AlertCircle className="w-8 h-8 text-error" />
      </div>
      <p className="text-error text-lg font-medium">{error}</p>
    </div>
  )

  return (
    <div className="card rounded-2xl overflow-hidden">
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
              {problems.map((p, index) => (
                <th key={p.id} className="px-4 py-4 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[80px]">
                  {String.fromCharCode(65 + index)}
                </th>
              ))}
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
                {problems.map((p) => {
                  const pStats = item.problems[p.id]
                  if (!pStats || pStats.status === 'Unsubmitted') {
                    return <td key={p.id} className="px-4 py-4 text-center text-muted-foreground/50">-</td>
                  }
                  
                  if (contestType === 'ACM') {
                    if (pStats.status === 'AC') {
                      return (
                        <td key={p.id} className="px-4 py-4 text-center bg-secondary/10">
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
                      <td key={p.id} className="px-4 py-4 text-center bg-error/10">
                        <div className="text-error font-bold">
                          -{pStats.tries}
                        </div>
                      </td>
                    )
                  }

                  const isAc = pStats.score === 100
                  const isZero = pStats.score === 0
                  return (
                    <td key={p.id} className={`px-4 py-4 text-center ${isAc ? 'bg-secondary/10' : isZero ? 'bg-error/10' : 'bg-accent/10'}`}>
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
  )
}
