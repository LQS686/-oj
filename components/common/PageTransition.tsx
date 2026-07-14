'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [displayChildren, setDisplayChildren] = useState(children)
  const [transitionStage, setTransitionStage] = useState<'visible' | 'fading'>('visible')
  const prevPathname = useRef(pathname)

  const isAdminRoute = pathname.startsWith('/admin')

  useEffect(() => {
    if (pathname !== prevPathname.current) {
      prevPathname.current = pathname
      if (!isAdminRoute) {
        setTransitionStage('fading')
      }
    }
  }, [pathname, isAdminRoute])

  useEffect(() => {
    if (transitionStage === 'fading') {
      const t = setTimeout(() => {
        setDisplayChildren(children)
        setTransitionStage('visible')
      }, 120)
      return () => clearTimeout(t)
    }
  }, [transitionStage, children])

  if (isAdminRoute) {
    return <>{children}</>
  }

  return (
    <div
      style={{
        opacity: transitionStage === 'fading' ? 0 : 1,
        transition: 'opacity 120ms ease-in-out',
        willChange: 'opacity',
      }}
    >
      {displayChildren}
    </div>
  )
}
