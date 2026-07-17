'use client'

import { useState, useEffect, ReactNode } from 'react'
import { Filter, X, RotateCcw, Check } from 'lucide-react'

interface FilterBarProps {
  children: ReactNode
  activeCount?: number
  onReset?: () => void
  onApply?: () => void
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])
  return isMobile
}

export default function FilterBar({ children, activeCount = 0, onReset, onApply }: FilterBarProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const isMobile = useIsMobile()

  // 移动端折叠按钮
  if (isMobile) {
    return (
      <>
        <button
          onClick={() => setDrawerOpen(true)}
          className="btn btn-ghost btn p-3 flex items-center gap-2 relative"
          aria-label="打开筛选"
        >
          <Filter className="w-5 h-5" />
          <span className="text-sm font-medium">筛选</span>
          {activeCount > 0 && (
            <span className="badge-primary badge min-w-[20px] h-[20px] text-[11px]">
              {activeCount}
            </span>
          )}
        </button>

        {drawerOpen && (
          <>
            <div
              className="fixed inset-0 bg-black/50 z-40"
              onClick={() => setDrawerOpen(false)}
              aria-hidden="true"
            />
            <aside
              className="fixed right-0 top-0 h-full w-80 max-w-[85vw] bg-background-secondary z-50 shadow-xl flex flex-col"
              role="dialog"
              aria-label="筛选抽屉"
            >
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h3 className="text-base font-bold text-foreground">筛选</h3>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="p-2 hover:bg-muted rounded-lg transition-colors"
                  aria-label="关闭"
                >
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {children}
              </div>

              <div className="flex items-center gap-3 p-4 border-t border-border bg-background">
                <button
                  onClick={() => {
                    onReset?.()
                    setDrawerOpen(false)
                  }}
                  className="btn btn-ghost flex-1 py-3 flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  重置
                </button>
                <button
                  onClick={() => {
                    onApply?.()
                    setDrawerOpen(false)
                  }}
                  className="btn btn-primary flex-1 py-3 flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  应用
                </button>
              </div>
            </aside>
          </>
        )}
      </>
    )
  }

  // 桌面端展开渲染
  return (
    <div className="card p-4">
      <div className="flex gap-4 flex-wrap items-center">
        {children}
      </div>
    </div>
  )
}
