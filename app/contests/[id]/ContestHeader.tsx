'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Clock, FileText, List, BarChart2, Info, Play, Timer, CheckCircle2 } from 'lucide-react'
import { useEffect, useState } from 'react'

interface Contest {
  id: string
  title: string
  startTime: Date
  endTime: Date
  type: string
}

export default function ContestHeader({ contest, canViewDetails = false }: { contest: Contest, canViewDetails?: boolean }) {
  const pathname = usePathname()
  const [timeLeft, setTimeLeft] = useState<string>('')
  const [status, setStatus] = useState<string>('')
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date().getTime()
      const start = new Date(contest.startTime).getTime()
      const end = new Date(contest.endTime).getTime()
      
      if (now < start) {
        setStatus('即将开始')
        const diff = start - now
        setTimeLeft(formatDuration(diff))
        setProgress(0)
      } else if (now > end) {
        setStatus('已结束')
        setTimeLeft('00:00:00')
        setProgress(100)
      } else {
        setStatus('进行中')
        const diff = end - now
        setTimeLeft(formatDuration(diff))
        const total = end - start
        const current = now - start
        setProgress(Math.min(100, (current / total) * 100))
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [contest])

  const formatDuration = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    
    if (hours > 24) {
      const days = Math.floor(hours / 24)
      return `${days}天 ${hours % 24}小时`
    }
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }

  const getStatusConfig = () => {
    switch (status) {
      case '进行中':
        return { tag: 'tag-success', icon: Play, bgClass: 'bg-secondary/10', iconClass: 'text-secondary-light' }
      case '即将开始':
        return { tag: 'tag-primary', icon: Timer, bgClass: 'bg-primary/10', iconClass: 'text-primary-light' }
      case '已结束':
        return { tag: 'tag', icon: CheckCircle2, bgClass: 'bg-muted/50', iconClass: 'text-muted-foreground' }
      default:
        return { tag: 'tag', icon: Clock, bgClass: 'bg-muted/50', iconClass: 'text-muted-foreground' }
    }
  }

  const baseTabs = [
    { name: '概览', path: `/contests/${contest.id}`, icon: Info },
  ]
  
  const detailTabs = [
    { name: '题目', path: `/contests/${contest.id}/problems`, icon: FileText },
    { name: '提交', path: `/contests/${contest.id}/submissions`, icon: List },
    { name: '排名', path: `/contests/${contest.id}/rank`, icon: BarChart2 },
  ]
  
  const tabs = canViewDetails ? [...baseTabs, ...detailTabs] : baseTabs

  const isActive = (path: string) => {
    if (path === `/contests/${contest.id}`) {
      return pathname === path
    }
    return pathname.startsWith(path)
  }

  const statusConfig = getStatusConfig()
  const StatusIcon = statusConfig.icon

  return (
    <div className="glass-strong border-b border-border">
      <div className="container mx-auto px-4 pt-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <div className={`w-10 h-10 rounded-xl ${statusConfig.bgClass} flex items-center justify-center`}>
                <StatusIcon className={`w-5 h-5 ${statusConfig.iconClass}`} />
              </div>
              <h1 className="text-2xl font-bold text-foreground">{contest.title}</h1>
              <span className={statusConfig.tag}>
                {status || '加载中...'}
              </span>
              <span className="tag tag-primary">
                {contest.type}
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4 text-primary-light" />
                <span>{new Date(contest.startTime).toLocaleString('zh-CN')} ~ {new Date(contest.endTime).toLocaleString('zh-CN')}</span>
              </div>
            </div>
          </div>

          <div className="w-full md:w-64">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted-foreground">{status === '已结束' ? '已结束' : status === '即将开始' ? '距离开始' : '剩余时间'}</span>
              <span className="font-mono font-medium text-primary-light">{timeLeft}</span>
            </div>
            <div className="w-full bg-muted/50 rounded-full h-2.5 overflow-hidden">
              <div 
                className={`h-2.5 rounded-full transition-all duration-1000 ${
                  status === '已结束' ? 'bg-muted-foreground' : 
                  status === '进行中' ? 'bg-gradient-to-r from-secondary to-secondary-light' : 
                  'bg-gradient-to-r from-primary to-primary-light'
                }`}
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>
        </div>

        <div className="glass p-1.5 rounded-xl flex gap-1 overflow-x-auto pb-4">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const active = isActive(tab.path)
            return (
              <Link
                key={tab.path}
                href={tab.path}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all whitespace-nowrap ${
                  active
                    ? 'bg-primary text-white shadow-lg shadow-primary/30'
                    : 'text-muted-foreground hover:bg-primary/10 hover:text-primary-light'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.name}
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
