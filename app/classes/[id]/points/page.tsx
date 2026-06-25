'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Coins, Trophy, Gift, BookOpen, Award, ShoppingBag, Scroll, HelpCircle } from 'lucide-react'
import { fetchWithAuth } from '@/lib/api/base'
import { ClassWorkspaceShell, PageLoading } from '@/components/common'
import { useClass } from '@/hooks/useClass'
import { useUser } from '@/contexts/UserContext'

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

export default function ClassPointsPage() {
  const params = useParams()
  const router = useRouter()
  const classId = params.id as string
  const { user } = useUser()
  const { classData } = useClass(classId)

  const [balance, setBalance] = useState<PointsBalance>({
    totalPoints: 0,
    availablePoints: 0,
    usedPoints: 0,
  })
  const [ranking, setRanking] = useState<RankingItem[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = async () => {
    try {
      if (!user) {
        router.push('/login')
        return
      }

      const balanceRes = await fetchWithAuth(`/api/classes/${classId}/points/balance`)
      const balanceData = await balanceRes.json()
      if (balanceData.success) {
        setBalance(balanceData.data)
      }

      const rankingRes = await fetchWithAuth(`/api/classes/${classId}/points/ranking?limit=10`)
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

  useEffect(() => {
    loadData()
  }, [classId, user])

  const myRankIndex = user ? ranking.findIndex((item) => item.userId === user.id) : -1
  const myRank = myRankIndex >= 0 ? myRankIndex + 1 : null

  if (loading) {
    return <PageLoading label="加载积分数据中..." />
  }

  return (
    <ClassWorkspaceShell
      classId={classId}
      className={classData?.name}
      title="班级积分"
      description="完成作业、阅读笔记获取积分；可在商城兑换奖励"
      icon={Coins}
      iconClassName="bg-accent text-white"
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="card-static rounded-lg p-5 border border-border">
          <p className="text-sm text-muted-foreground mb-1">可用积分</p>
          <p className="text-3xl font-bold text-foreground">{balance.availablePoints}</p>
          <p className="text-xs text-muted-foreground mt-2">累计获得 {balance.totalPoints}</p>
        </div>
        <div className="card-static rounded-lg p-5 border border-border">
          <p className="text-sm text-muted-foreground mb-1">已使用</p>
          <p className="text-3xl font-bold text-foreground">{balance.usedPoints}</p>
          <p className="text-xs text-muted-foreground mt-2">兑换商品消耗</p>
        </div>
        <div className="card-static rounded-lg p-5 border border-border">
          <p className="text-sm text-muted-foreground mb-1">我的排名</p>
          <p className="text-3xl font-bold text-foreground">{myRank != null ? `#${myRank}` : '-'}</p>
          <p className="text-xs text-muted-foreground mt-2">班级 Top 10</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Link
          href={`/classes/${classId}/points/history`}
          className="card-static rounded-lg p-4 border border-border hover:border-primary transition-colors"
        >
          <Scroll className="w-5 h-5 text-primary mb-2" />
          <h3 className="font-semibold text-sm text-foreground">积分历史</h3>
          <p className="text-xs text-muted-foreground mt-0.5">变动记录</p>
        </Link>
        <Link
          href={`/classes/${classId}/points/shop`}
          className="card-static rounded-lg p-4 border border-border hover:border-primary transition-colors"
        >
          <ShoppingBag className="w-5 h-5 text-secondary mb-2" />
          <h3 className="font-semibold text-sm text-foreground">积分商城</h3>
          <p className="text-xs text-muted-foreground mt-0.5">兑换礼品</p>
        </Link>
        <Link
          href={`/classes/${classId}/points/rules`}
          className="card-static rounded-lg p-4 border border-border hover:border-primary transition-colors"
        >
          <HelpCircle className="w-5 h-5 text-muted-foreground mb-2" />
          <h3 className="font-semibold text-sm text-foreground">积分规则</h3>
          <p className="text-xs text-muted-foreground mt-0.5">获取方式</p>
        </Link>
        <Link
          href={`/classes/${classId}/assignments`}
          className="card-static rounded-lg p-4 border border-border hover:border-primary transition-colors"
        >
          <BookOpen className="w-5 h-5 text-primary mb-2" />
          <h3 className="font-semibold text-sm text-foreground">去做作业</h3>
          <p className="text-xs text-muted-foreground mt-0.5">赚取积分</p>
        </Link>
      </div>

      <div className="card-static rounded-lg border border-border overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-foreground">积分排行榜</h2>
          </div>
          <span className="tag text-xs">Top 10</span>
        </div>
        <div className="divide-y divide-border">
          {ranking.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              <Trophy className="w-10 h-10 mx-auto mb-2 opacity-40" />
              暂无排行数据
            </div>
          ) : (
            ranking.map((item, index) => (
              <div
                key={item.userId}
                className={`flex items-center gap-4 px-4 py-3 ${
                  index < 3 ? 'bg-muted/50' : 'hover:bg-muted'
                }`}
              >
                <div
                  className={`w-8 text-center text-sm font-bold tabular-nums ${
                    index === 0
                      ? 'text-amber-600'
                      : index === 1
                        ? 'text-slate-500'
                        : index === 2
                          ? 'text-amber-700'
                          : 'text-muted-foreground'
                  }`}
                >
                  {item.rank}
                </div>
                <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-white text-sm font-bold shrink-0">
                  {item.nickname?.[0] || item.username?.[0] || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground text-sm truncate">
                    {item.nickname || item.username}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">@{item.username}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-primary">{item.totalPoints}</p>
                  <p className="text-xs text-muted-foreground">总积分</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card-static rounded-lg p-5 border border-border">
        <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
          <Gift className="w-4 h-4 text-muted-foreground" />
          如何获得积分
        </h3>
        <ul className="grid md:grid-cols-3 gap-3 text-sm text-muted-foreground">
          <li className="rounded-lg border border-border p-3 bg-muted/30">
            <span className="font-medium text-foreground block mb-1">完成作业</span>
            通过作业题目可获得积分，难度越高奖励越多
          </li>
          <li className="rounded-lg border border-border p-3 bg-muted/30">
            <span className="font-medium text-foreground block mb-1">阅读笔记</span>
            首次阅读班级笔记可获得积分
          </li>
          <li className="rounded-lg border border-border p-3 bg-muted/30">
            <span className="font-medium text-foreground block mb-1">教师奖励</span>
            课堂表现优秀可由教师手动加分
          </li>
        </ul>
      </div>
    </ClassWorkspaceShell>
  )
}