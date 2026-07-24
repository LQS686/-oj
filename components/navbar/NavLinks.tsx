'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useRef, useEffect, useState } from 'react'
import {
  BookOpen,
  Trophy,
  Dumbbell,
  GraduationCap,
  BarChart3
} from 'lucide-react'

interface NavLink {
  href: string
  label: string
  icon: React.ElementType
}

const navLinks: NavLink[] = [
  { href: '/problems', label: '题库', icon: BookOpen },
  { href: '/contests', label: '竞赛', icon: Trophy },
  { href: '/training', label: '训练', icon: Dumbbell },
  { href: '/classes', label: '班级', icon: GraduationCap },
  { href: '/rank', label: '排行榜', icon: BarChart3 },
]

export default function NavLinks() {
  const pathname = usePathname()
  const containerRef = useRef<HTMLDivElement>(null)
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const activeEl = containerRef.current.querySelector('.active') as HTMLElement | null
    if (activeEl) {
      const containerRect = containerRef.current.getBoundingClientRect()
      const activeRect = activeEl.getBoundingClientRect()
      setIndicator({
        left: activeRect.left - containerRect.left,
        width: activeRect.width,
      })
    } else {
      setIndicator(null)
    }
  }, [pathname])

  return (
    <div ref={containerRef} className="hidden lg:flex items-center gap-0.5 relative">
      {indicator && (
        <div
          className="absolute top-0 bottom-0 bg-primary/10 rounded-lg pointer-events-none"
          style={{
            left: indicator.left,
            width: indicator.width,
            transition: 'left 200ms ease, width 200ms ease',
          }}
        />
      )}
      {navLinks.map((link) => {
        const Icon = link.icon
        const isActive =
          pathname === link.href ||
          pathname.startsWith(link.href + '/') ||
          (link.href === '/problems' && pathname.startsWith('/problem/'))
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`nav-link group relative ${isActive ? 'active' : ''}`}
          >
            <span className="relative z-10 flex items-center gap-1.5">
              <Icon className={`w-4 h-4 ${isActive ? '' : 'group-hover:text-primary'}`} />
              {link.label}
            </span>
          </Link>
        )
      })}
    </div>
  )
}
