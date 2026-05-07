'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Coins, Trophy, Gift, BookOpen, ArrowLeft, Sparkles, Award, ShoppingBag, Scroll, HelpCircle } from 'lucide-react'
import { fetchWithAuth } from '@/lib/api/base'

interface PointsBalance {
  totalPoints: number
  availablePoints: number
  usedPoints: number
}

interface RankingItem {
  rank: number
  userId: string
  username: string
  nickname: string
  avatar?: string
  totalPoints: number
  availablePoints: number
}

export default function TeamPointsPage() {
  const params = useParams()
  const router = useRouter()
  const teamId = params.id as string

  const [balance, setBalance] = useState<PointsBalance>({
    totalPoints: 0,
    availablePoints: 0,
    usedPoints: 0
  })
  const [ranking, setRanking] = useState<RankingItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [teamId])

  const loadData = async () => {
    try {
      const token = localStorage.getItem('token')
      if (!token) {
        router.push('/login')
        return
      }

      const balanceRes = await fetchWithAuth(`/api/teams/${teamId}/points/balance`)
      const balanceData = await balanceRes.json()
      if (balanceData.success) {
        setBalance(balanceData.data)
      }

      const rankingRes = await fetchWithAuth(`/api/teams/${teamId}/points/ranking?limit=10`)
      const rankingData = await rankingRes.json()
      if (rankingData.success) {
        setRanking(rankingData.data)
      }

      setLoading(false)
    } catch (error) {
      console.error('加载失败:', error)
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20"></div>
            <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
          </div>
          <p className="text-muted-foreground text-lg">加载积分数据中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <Link
          href={`/teams/${teamId}`}
          className="flex items-center gap-2 text-muted-foreground hover:text-primary-light mb-6 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          返回团队详情
        </Link>

        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
            <Coins className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">团队积分系统</h1>
            <p className="text-muted-foreground text-sm">完成作业、阅读笔记获取积分奖励</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="card-static rounded-2xl p-6 bg-gradient-to-br from-primary to-primary-dark">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <span className="text-white/80 text-sm">可用积分</span>
            </div>
            <p className="text-4xl font-bold text-white">{balance.availablePoints}</p>
            <p className="text-white/60 text-sm mt-2">累计获得：{balance.totalPoints} 积分</p>
          </div>

          <div className="card-static rounded-2xl p-6 bg-gradient-to-br from-purple-500 to-purple-600">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
                <Gift className="w-5 h-5 text-white" />
              </div>
              <span className="text-white/80 text-sm">已使用积分</span>
            </div>
            <p className="text-4xl font-bold text-white">{balance.usedPoints}</p>
            <p className="text-white/60 text-sm mt-2">兑换商品消耗</p>
          </div>

          <div className="card-static rounded-2xl p-6 bg-gradient-to-br from-secondary to-secondary-dark">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
                <Trophy className="w-5 h-5 text-white" />
              </div>
              <span className="text-white/80 text-sm">我的排名</span>
            </div>
            <p className="text-4xl font-bold text-white">
              {ranking.length > 0 ? `#${ranking.findIndex((item) => item.userId === localStorage.getItem('userId')) + 1 || '-'}` : '-'}
            </p>
            <p className="text-white/60 text-sm mt-2">团队排行榜</p>
          </div>
        </div>

        <div className="card-static rounded-2xl p-6 mb-8">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
              <Award className="w-5 h-5 text-primary-light" />
              <h2 className="text-xl font-bold text-foreground">积分排行榜</h2>
            </div>
            <span className="tag">Top 10</span>
          </div>

          <div className="space-y-3">
            {ranking.map((item, index) => (
              <div
                key={item.userId}
                className={`flex items-center gap-4 p-4 rounded-xl transition-colors ${
                  index < 3 ? 'bg-accent/100/10 border border-amber-500/20' : 'bg-muted/50 hover:bg-muted/80'
                }`}
              >
                <div className="w-12 text-center">
                  {index === 0 && <span className="text-3xl">🥇</span>}
                  {index === 1 && <span className="text-3xl">🥈</span>}
                  {index === 2 && <span className="text-3xl">🥉</span>}
                  {index >= 3 && (
                    <span className="text-xl font-bold text-muted-foreground">{item.rank}</span>
                  )}
                </div>

                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-bold">
                  {item.nickname?.[0] || item.username?.[0] || '?'}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-foreground">{item.nickname || item.username}</p>
                  <p className="text-sm text-muted-foreground">@{item.username}</p>
                </div>

                <div className="text-right">
                  <p className="text-2xl font-bold text-primary-light">{item.totalPoints}</p>
                  <p className="text-xs text-muted-foreground">总积分</p>
                </div>
              </div>
            ))}

            {ranking.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Trophy className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p>暂无排行数据</p>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Link
            href={`/teams/${teamId}/points/history`}
            className="card p-6 hover:bg-muted/50 transition-colors text-center group"
          >
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3 group-hover:bg-primary/20 transition-colors">
              <Scroll className="w-6 h-6 text-primary-light" />
            </div>
            <h3 className="font-bold text-foreground mb-1">积分历史</h3>
            <p className="text-sm text-muted-foreground">查看积分变动记录</p>
          </Link>

          <Link
            href={`/teams/${teamId}/points/shop`}
            className="card p-6 hover:bg-muted/50 transition-colors text-center group"
          >
            <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center mx-auto mb-3 group-hover:bg-secondary/20 transition-colors">
              <ShoppingBag className="w-6 h-6 text-secondary-light" />
            </div>
            <h3 className="font-bold text-foreground mb-1">积分商城</h3>
            <p className="text-sm text-muted-foreground">兑换精美礼品</p>
          </Link>

          <Link
            href={`/teams/${teamId}/points/exchanges`}
            className="card p-6 hover:bg-muted/50 transition-colors text-center group"
          >
            <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mx-auto mb-3 group-hover:bg-accent/20 transition-colors">
              <Gift className="w-6 h-6 text-accent-light" />
            </div>
            <h3 className="font-bold text-foreground mb-1">兑换记录</h3>
            <p className="text-sm text-muted-foreground">查看兑换订单</p>
          </Link>

          <Link
            href={`/teams/${teamId}/points/rules`}
            className="card p-6 hover:bg-muted/50 transition-colors text-center group"
          >
            <div className="w-12 h-12 rounded-xl bg-info/10 flex items-center justify-center mx-auto mb-3 group-hover:bg-info/20 transition-colors">
              <HelpCircle className="w-6 h-6 text-info" />
            </div>
            <h3 className="font-bold text-foreground mb-1">积分规则</h3>
            <p className="text-sm text-muted-foreground">了解如何获得积分</p>
          </Link>
        </div>

        <div className="card-static rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <BookOpen className="w-5 h-5 text-primary-light" />
            <h3 className="font-bold text-lg text-foreground">如何获得积分？</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="glass rounded-xl p-4">
              <h4 className="font-semibold text-secondary-light mb-2 flex items-center gap-2">
                <span className="text-lg">✅</span> 完成作业
              </h4>
              <p className="text-sm text-muted-foreground">完成团队作业题目可获得 10-50 积分，难度越高积分越多</p>
            </div>
            <div className="glass rounded-xl p-4">
              <h4 className="font-semibold text-secondary-light mb-2 flex items-center gap-2">
                <span className="text-lg">📚</span> 阅读笔记
              </h4>
              <p className="text-sm text-muted-foreground">首次阅读团队笔记可获得 5 积分</p>
            </div>
            <div className="glass rounded-xl p-4">
              <h4 className="font-semibold text-secondary-light mb-2 flex items-center gap-2">
                <span className="text-lg">⭐</span> 课堂表现
              </h4>
              <p className="text-sm text-muted-foreground">积极参与课堂可由教师评估后获得 1-100 积分奖励</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
