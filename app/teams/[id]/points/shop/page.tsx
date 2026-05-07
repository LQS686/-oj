'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ShoppingBag, ArrowLeft, Coins, Package, Star, Zap, Loader2 } from 'lucide-react'
import { fetchWithAuth } from '@/lib/api/base'

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
  const teamId = params.id as string

  const [items, setItems] = useState<ShopItem[]>([])
  const [balance, setBalance] = useState<PointsBalance>({ availablePoints: 0 })
  const [category, setCategory] = useState<string>('ALL')
  const [loading, setLoading] = useState(true)
  const [exchanging, setExchanging] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [teamId, category])

  const loadData = async () => {
    try {
      setLoading(true)
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

      let url = `/api/teams/${teamId}/points/shop?isActive=true`
      if (category !== 'ALL') {
        url += `&category=${category}`
      }

      const itemsRes = await fetchWithAuth(url)
      const itemsData = await itemsRes.json()
      if (itemsData.success) {
        setItems(itemsData.data.items)
      }

      setLoading(false)
    } catch (error) {
      console.error('加载失败:', error)
      setLoading(false)
    }
  }

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

      const res = await fetchWithAuth(`/api/teams/${teamId}/points/shop/exchange`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ itemId, quantity: 1 })
      })

      const data = await res.json()

      if (data.success) {
        alert('兑换成功！请到「兑换记录」查看订单详情')
        loadData()
      } else {
        alert('兑换失败：' + data.error)
      }

      setExchanging(null)
    } catch (error) {
      console.error('兑换失败:', error)
      alert('兑换失败，请稍后重试')
      setExchanging(null)
    }
  }

  const getCategoryStyle = (cat: string) => {
    switch (cat) {
      case 'VIRTUAL':
        return { label: '虚拟商品', icon: Zap, color: 'text-info' }
      case 'PHYSICAL':
        return { label: '实物商品', icon: Package, color: 'text-secondary-light' }
      case 'PRIVILEGE':
        return { label: '特殊权限', icon: Star, color: 'text-accent-light' }
      default:
        return { label: cat, icon: Package, color: 'text-muted-foreground' }
    }
  }

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="flex items-center gap-2 text-sm mb-6">
          <Link
            href={`/teams/${teamId}/points`}
            className="text-muted-foreground hover:text-primary-light transition-colors flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" />
            积分概览
          </Link>
          <span className="text-muted-foreground/50">/</span>
          <span className="text-foreground font-medium">积分商城</span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-secondary to-secondary-dark flex items-center justify-center shadow-lg shadow-secondary/30">
              <ShoppingBag className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">积分商城</h1>
              <p className="text-muted-foreground text-sm">使用积分兑换精美礼品</p>
            </div>
          </div>
          <div className="glass rounded-xl px-4 py-3 flex items-center gap-3">
            <Coins className="w-5 h-5 text-primary-light" />
            <span className="text-muted-foreground text-sm">可用积分：</span>
            <span className="text-xl font-bold text-primary-light">
              {balance.availablePoints}
            </span>
          </div>
        </div>

        <div className="card-static rounded-2xl p-4 mb-6">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setCategory('ALL')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                category === 'ALL'
                  ? 'bg-primary text-white'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted'
              }`}
            >
              全部商品
            </button>
            <button
              onClick={() => setCategory('VIRTUAL')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                category === 'VIRTUAL'
                  ? 'bg-info text-white'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted'
              }`}
            >
              虚拟商品
            </button>
            <button
              onClick={() => setCategory('PHYSICAL')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                category === 'PHYSICAL'
                  ? 'bg-secondary text-white'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted'
              }`}
            >
              实物商品
            </button>
            <button
              onClick={() => setCategory('PRIVILEGE')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                category === 'PRIVILEGE'
                  ? 'bg-accent text-white'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted'
              }`}
            >
              特殊权限
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16">
            <div className="relative w-16 h-16 mx-auto mb-6">
              <div className="absolute inset-0 rounded-full border-2 border-primary/20"></div>
              <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
            </div>
            <p className="text-muted-foreground">加载商品中...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="card-static rounded-2xl p-16 text-center">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
              <ShoppingBag className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">暂无商品</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {items.map((item) => {
              const catStyle = getCategoryStyle(item.category)
              const CatIcon = catStyle.icon
              const canExchange = balance.availablePoints >= item.pointsRequired && 
                                  (item.isUnlimited || item.stock > 0)
              
              return (
                <div
                  key={item.id}
                  className="card overflow-hidden group hover:border-primary/20 transition-all"
                >
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-full h-48 object-cover"
                    />
                  ) : (
                    <div className="w-full h-48 bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center">
                      <span className="text-6xl">🎁</span>
                    </div>
                  )}

                  <div className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-bold text-lg text-foreground flex-1">{item.name}</h3>
                      <span className={`tag ml-2 shrink-0 ${catStyle.color}`}>
                        <CatIcon className="w-3 h-3 inline mr-1" />
                        {catStyle.label}
                      </span>
                    </div>

                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                      {item.description || '暂无描述'}
                    </p>

                    {!item.isUnlimited && (
                      <p className="text-sm text-muted-foreground mb-2">
                        库存：{item.stock > 0 ? item.stock : '已售罄'}
                      </p>
                    )}

                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                      <div>
                        <span className="text-2xl font-bold text-primary-light">
                          {item.pointsRequired}
                        </span>
                        <span className="text-sm text-muted-foreground ml-1">积分</span>
                      </div>

                      <button
                        onClick={() => handleExchange(item.id, item.name, item.pointsRequired)}
                        disabled={exchanging === item.id || !canExchange}
                        className={`btn text-sm px-4 py-2 ${
                          exchanging === item.id
                            ? 'bg-muted text-muted-foreground cursor-wait'
                            : canExchange
                            ? 'btn-primary'
                            : 'bg-muted/50 text-muted-foreground cursor-not-allowed'
                        }`}
                      >
                        {exchanging === item.id ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin mr-1" />
                            兑换中...
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
      </div>
    </div>
  )
}
