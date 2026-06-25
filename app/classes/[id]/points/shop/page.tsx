'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ShoppingBag, Coins, Package, Star, Zap, Loader2, Gift } from 'lucide-react'
import { fetchWithAuth } from '@/lib/api/base'
import { ClassWorkspaceShell, PageLoading } from '@/components/common'
import { useClass } from '@/hooks/useClass'
import { useUser } from '@/contexts/UserContext'

interface ShopItem {
  id: string
  name: string
  description: string
  category: string
  pointsRequired: number
  stock: number
  isUnlimited: boolean
  imageUrl?: string
  isActive: boolean
}

interface PointsBalance {
  availablePoints: number
}

export default function PointsShopPage() {
  const params = useParams()
  const router = useRouter()
  const classId = params.id as string
  const { user } = useUser()
  const { classData } = useClass(classId)

  const [items, setItems] = useState<ShopItem[]>([])
  const [balance, setBalance] = useState<PointsBalance>({ availablePoints: 0 })
  const [category, setCategory] = useState<string>('ALL')
  const [loading, setLoading] = useState(true)
  const [exchanging, setExchanging] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      if (!user) {
        router.push('/login')
        return
      }

      const balanceRes = await fetchWithAuth(`/api/classes/${classId}/points/balance`)
      const balanceData = await balanceRes.json()
      if (balanceData.success) {
        setBalance(balanceData.data)
      }

      let url = `/api/classes/${classId}/points/shop?isActive=true`
      if (category !== 'ALL') {
        url += `&category=${category}`
      }

      const itemsRes = await fetchWithAuth(url)
      const itemsData = await itemsRes.json()
      if (itemsData.success) {
        setItems(itemsData.data.items)
      }
    } catch (error) {
      console.error('加载失败:', error)
    } finally {
      setLoading(false)
    }
  }, [classId, category, user, router])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleExchange = async (itemId: string, itemName: string, pointsRequired: number) => {
    if (balance.availablePoints < pointsRequired) {
      alert('积分不足！')
      return
    }

    if (!confirm(`确定要兑换「${itemName}」吗？将消耗 ${pointsRequired} 积分`)) {
      return
    }

    try {
      setExchanging(itemId)

      const res = await fetchWithAuth(`/api/classes/${classId}/points/shop/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, quantity: 1 }),
      })

      const data = await res.json()

      if (data.success) {
        alert('兑换成功！请到「兑换记录」查看订单详情')
        loadData()
      } else {
        alert('兑换失败：' + data.error)
      }
    } catch (error) {
      console.error('兑换失败:', error)
      alert('兑换失败，请稍后重试')
    } finally {
      setExchanging(null)
    }
  }

  const getCategoryStyle = (cat: string) => {
    switch (cat) {
      case 'VIRTUAL':
        return { label: '虚拟商品', icon: Zap, color: 'text-info' }
      case 'PHYSICAL':
        return { label: '实物商品', icon: Package, color: 'text-secondary' }
      case 'PRIVILEGE':
        return { label: '特殊权限', icon: Star, color: 'text-accent' }
      default:
        return { label: cat, icon: Package, color: 'text-muted-foreground' }
    }
  }

  const categories = [
    { key: 'ALL', label: '全部商品' },
    { key: 'VIRTUAL', label: '虚拟商品' },
    { key: 'PHYSICAL', label: '实物商品' },
    { key: 'PRIVILEGE', label: '特殊权限' },
  ] as const

  const toolbar = (
    <div className="flex gap-2 flex-wrap">
      {categories.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => setCategory(key)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
            category === key
              ? 'bg-primary text-white border-primary'
              : 'bg-card text-muted-foreground border-border hover:text-foreground'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )

  if (loading && items.length === 0) {
    return <PageLoading label="加载商品中..." />
  }

  return (
    <ClassWorkspaceShell
      classId={classId}
      className={classData?.name}
      title="积分商城"
      description="使用积分兑换礼品"
      icon={ShoppingBag}
      actions={
        <div className="flex items-center gap-3 flex-wrap">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-card text-sm">
            <Coins className="w-4 h-4 text-primary" />
            <span className="text-muted-foreground">可用</span>
            <span className="font-bold text-foreground">{balance.availablePoints}</span>
          </div>
          <Link href={`/classes/${classId}/points`} className="btn btn-ghost btn-sm">
            积分概览
          </Link>
        </div>
      }
      toolbar={toolbar}
    >
      {loading ? (
        <div className="py-12 text-center text-muted-foreground text-sm">加载商品中...</div>
      ) : items.length === 0 ? (
        <div className="bg-card rounded-lg border border-border p-16 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <ShoppingBag className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">暂无商品</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => {
            const catStyle = getCategoryStyle(item.category)
            const CatIcon = catStyle.icon
            const canExchange =
              balance.availablePoints >= item.pointsRequired && (item.isUnlimited || item.stock > 0)

            return (
              <div
                key={item.id}
                className="bg-card rounded-lg border border-border overflow-hidden hover:border-primary transition-colors"
              >
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.name} className="w-full h-40 object-cover" />
                ) : (
                  <div className="w-full h-40 bg-muted flex items-center justify-center">
                    <Gift className="w-12 h-12 text-muted-foreground" />
                  </div>
                )}

                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-semibold text-foreground flex-1">{item.name}</h3>
                    <span className={`tag text-xs shrink-0 ${catStyle.color}`}>
                      <CatIcon className="w-3 h-3 inline mr-1" />
                      {catStyle.label}
                    </span>
                  </div>

                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                    {item.description || '暂无描述'}
                  </p>

                  {!item.isUnlimited && (
                    <p className="text-xs text-muted-foreground mb-2">
                      库存：{item.stock > 0 ? item.stock : '已售罄'}
                    </p>
                  )}

                  <div className="flex items-center justify-between pt-3 border-t border-border gap-2">
                    <div>
                      <span className="text-xl font-bold text-primary">{item.pointsRequired}</span>
                      <span className="text-xs text-muted-foreground ml-1">积分</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleExchange(item.id, item.name, item.pointsRequired)}
                      disabled={exchanging === item.id || !canExchange}
                      className={`btn btn-sm ${
                        exchanging === item.id
                          ? 'btn-ghost cursor-wait'
                          : canExchange
                            ? 'btn-primary'
                            : 'btn-ghost opacity-60 cursor-not-allowed'
                      }`}
                    >
                      {exchanging === item.id ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          兑换中
                        </>
                      ) : balance.availablePoints < item.pointsRequired ? (
                        '积分不足'
                      ) : !item.isUnlimited && item.stock === 0 ? (
                        '已售罄'
                      ) : (
                        '立即兑换'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </ClassWorkspaceShell>
  )
}